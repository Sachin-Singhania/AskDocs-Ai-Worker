import { createClient, ErrorReply } from 'redis';
import { deletePdfFromS3, pdfUPLOAD, run } from './worker';
import { configDotenv } from "dotenv";
import { processUpdate } from './utility';
import { PDF_TASK, Status, TYPE_PDF, TYPE_URL, URL_TASK } from './types';
import { URL } from 'url';
import fs from "fs";
configDotenv();



const redis = createClient({
  url: process.env.REDIS_URL,
   socket: {
    reconnectStrategy: (retries) => {
      console.log(`🔄 Reconnecting to Redis... Attempt #${retries}`);
      const baseDelay = 200;
      const maxDelay = 5000;
      const delay = Math.min(baseDelay * retries, maxDelay);
      const jitter = Math.random() * 100;
      return jitter + delay; 
    },
  },
});

redis.on('error', (err:ErrorReply) => console.error('Redis Client Error', err));

(async () => {
  await redis.connect();
  console.log("✅ Redis client connected successfully");

  const QUEUE_NAME = process.env.QUEUE_NAME || 'task_queue'
  console.log(`🚀 Worker is running and waiting for tasks from "${QUEUE_NAME}"...`);

  while (true) {
    try {
      const result = await redis.blPop(QUEUE_NAME, 0); 
      const task = result?.element;
        if (!task) {
            console.log('❗ No task received, retrying...');
            continue;
        }

      const obj : URL_TASK | PDF_TASK = JSON.parse(task);

      if (obj.type === 'PDF') {
        
        const { name, path,key,chatId } = obj;
        console.log(`📄 Processing PDF: ${name} from path: ${path}`);

        const {Status,collectionName,outputPath}=await pdfUPLOAD(name, path,key,chatId);
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
})();