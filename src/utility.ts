
import { prisma } from "./prisma";
import { Status } from "./types";
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



export async function processUpdate(chatId: string, status: Status, collectionName?: string) {
    try {
            const chat=await prisma.chat.update({
                where: {
                    id: chatId
                },
                data: {
                    status,
                    ...(collectionName && { collectionName })
                },select:{
                    userId:true,
                }
            });
            if (status === Status.FAILED) {
                await prisma.user.update({
                    where:{
                        id : chat.userId
                    },data:{
                        limit: {
                            increment : 1
                        }
                    }
                });
            }
            console.log (`Updated chat ${chatId} to ${status}`);
    } catch (error) {
        console.error (`Error updating chat ${chatId} to ${status}: ${error}`);
    }
}


