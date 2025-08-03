import { TYPE } from "@prisma/client"

export type URL_TASK ={ url: string, type:"URL" , chatId:string }

export type PDF_TASK ={ name : string , type:"PDF",key:string ,chatId:string }
export enum Status {
      PROCESSING = "PROCESSING",
      COMPLETED = "COMPLETED",
      FAILED = "FAILED"
    }

export interface TYPE_URL {
    chatId:string,
    status: Status,
    type?:TYPE,
    url?:string,
    collectionName?:string
}
export interface TYPE_PDF {
    chatId:string,
    status: Status,
    type?:TYPE,
    collectionName?:string
}