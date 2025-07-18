import { deletePdfFromS3, pdfUPLOAD, run } from './worker';
import { configDotenv } from "dotenv";
import { processUpdate } from './utility';
import { PDF_TASK, Status, TYPE_PDF, TYPE_URL, URL_TASK } from './types';
import { URL } from 'url';
import fs from "fs";
import { Redis } from '@upstash/redis';
configDotenv();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});


async function RedisWorker() {
  console.log("✅ Redis client connected successfully");
  const QUEUE_NAME = process.env.QUEUE_NAME || 'task_queue'
  console.log(`🚀 Worker is running and waiting for tasks from "${QUEUE_NAME}"...`);
  while (true) {
    try {
      const result = await redis.rpop(QUEUE_NAME); 
        if (!result) {
            console.log('❗ No task received, retrying...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
        }
          const obj: URL_TASK | PDF_TASK  = JSON.parse(JSON.stringify(result));
          if (obj.type === 'PDF') {
        
        const { name,key,chatId } = obj;
        console.log(`📄 Processing PDF: ${name}`);

        const {Status,collectionName,outputPath}=await pdfUPLOAD(name,key,chatId);
        if (Status) {
          const PDF:TYPE_PDF= {
            chatId,
           status: "COMPLETED" as Status,
           type :obj.type,
           collectionName,
          }
          await processUpdate(PDF);
          if (fs.existsSync(outputPath as string)) fs.unlinkSync(outputPath as string);
        } else {
          const PDF:TYPE_PDF= {
            chatId,
            status: "FAILED" as Status,
            type :obj.type,
          }
          if (fs.existsSync(outputPath as string)){
            fs.unlinkSync(outputPath as string)
          };
          await processUpdate(PDF);
        }
        
        const {message}= await deletePdfFromS3(key);
        console.log(message);        
      
      } else if (obj.type === 'URL') {
        
        const { url,chatId } = obj;
        console.log(`🌐 Processing URL: ${url}`);
        const {Status,collectionName }=await run(url,chatId);
        if (Status) {
          const urlupload:TYPE_URL={
            chatId,
             status: "COMPLETED" as Status,
           type :obj.type,
           collectionName,url:new URL(url).href
          }
          await processUpdate(urlupload);
        } else {
          const urlupload:TYPE_URL={
            chatId,
             status: "FAILED" as Status,
           type :obj.type,
          }
           await processUpdate(urlupload);
        }    

      }
    } catch (err) {
      console.error('❌ Error processing task:', err);
    }
  }
};
RedisWorker();