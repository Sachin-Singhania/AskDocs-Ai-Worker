export type URL_TASK ={ url: string, type:"url" , chatId:string }

export type PDF_TASK ={ name : string , path: string, type:"pdf",key:string ,chatId:string }
export enum Status {
      PROCESSING = "PROCESSING",
      COMPLETED = "COMPLETED",
      FAILED = "FAILED"
    }