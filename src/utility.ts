import fs from "fs";
import { URL } from 'url';
import { prisma } from './prisma';
import { PDF_TASK, Status, TYPE_PDF, TYPE_URL, URL_TASK } from './types';
import { deletePdfFromS3, pdfUPLOAD, run } from './worker';

// export function loadobject(urlObj:URL): Document[] {
//   const file = fs.readFileSync(urlObj.hostname + ".json", "utf-8");
//   const jsonData :{
//     [key: string]: string
//   } = JSON.parse(file);
//   const docs = Object.entries(jsonData).map(([key, value]) => {
//     return new Document({
//       pageContent: value,
//       metadata: { source: key },
//     })
//   });
//   return docs;
// }

export async function processUpdate( update: TYPE_URL | TYPE_PDF ) {
    try {
           await prisma.$transaction(async (tx) => {
                const chat = await tx.chat.update({
                    where: {
                        id: update.chatId
                    },
                    data: {
                        status: update.status,
                        ...(update.collectionName && { collectionName:update.collectionName })
                    },
                    select: {
                        userId: true,
                    }
                });
                if(update.status == "COMPLETED"){
                    await tx.user.update({
                        where:{
                            id : chat.userId
                        },data:{
                            limit: {
                                decrement : 1
                            }
                        }
                    });
                }
                if (update.status == "COMPLETED" && update.type === 'URL' && update.collectionName) {
                    await tx.uRL.create({
                        data: {
                            url: update.chatId, 
                            collectionName:update.collectionName,
                        },
                    });
                    }
            });
            console.log (`Updated chat ${update.chatId} to ${update.status}`);
    } catch (error) {
        console.error (`Error updating chat ${update.chatId} to ${update.status}: ${error}`);
    }
}


export async function processJob(obj:URL_TASK | PDF_TASK) {
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
}