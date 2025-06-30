import { prisma } from "./prisma";
import { Status, TYPE_PDF, TYPE_URL } from "./types";

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
            const result = await prisma.$transaction(async (tx) => {
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

                if (update.status == "COMPLETED" && update.type === 'URL' && update.collectionName) {
                    await tx.uRL.create({
                        data: {
                            url: update.chatId, 
                            collectionName:update.collectionName,
                        },
                    });
                }
                return chat;
            });
            if (update.status === Status.FAILED) {
                await prisma.user.update({
                    where:{
                        id : result.userId
                    },data:{
                        limit: {
                            increment : 1
                        }
                    }
                });
            }
            console.log (`Updated chat ${update.chatId} to ${status}`);
    } catch (error) {
        console.error (`Error updating chat ${update.chatId} to ${update.status}: ${error}`);
    }
}


