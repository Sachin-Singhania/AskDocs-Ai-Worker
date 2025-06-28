import { chromium } from "playwright";
import fs, { createWriteStream, mkdirSync } from "fs";
import {  GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAI as GoogleGenAI } from "@google/generative-ai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { configDotenv } from "dotenv";
import { Readable } from "stream";
import { dirname } from "path";
configDotenv();
if (!process.env.APIKEY) {
  throw new Error("APIKEY is not set in the environment variables");
}
const ai = new GoogleGenAI(process.env.APIKEY as string);
const embeddings = new GoogleGenerativeAIEmbeddings({
  modelName: 'text-embedding-004',
  apiKey: process.env.APIKEY,
})

async function Getalldocsdata(url:string) {
  const contentlist : {
    [key: string]: string;
  } = {};
  const urlObj = new URL(url);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.$eval("body", el => el.innerText);
    const url = page.url();
    const allLinks = await page.$$eval("a", (anchors, base) =>
      Array.from(new Set(anchors
        .map(a => a.getAttribute("href"))
        .filter(href =>
          href &&
          !href.startsWith("#") &&
          !href.startsWith("javascript:")
        )
        .map(href => {
          const fullUrl = new URL(href as string, base);
          fullUrl.hash = "";
          return fullUrl.href;
        })
      )),
      page.url());
      const filteredLinks = filterlinks(allLinks, urlObj);
      for (let i = 0; i < filteredLinks.length; i++) {
        const link = filteredLinks[i];
        await page.goto(link, { waitUntil: "domcontentloaded" });
        const content = await page.$eval("body", el => el.innerText);
        contentlist[link] = content;
      }
    } catch (error) {
      console.log(error);
    }
    await browser.close();

    // fs.writeFileSync(urlObj.hostname + ".json", JSON.stringify(contentlist, null, 2)); COST IS HIGH SO DIRECTLY VECTORIZE IT
    return contentlist;
  
}
function filterlinks(links: string[], urlObj: URL):string[] {
  const pathCounts: { [key: string]: number } = {};
  links.forEach(link => {
    const url = new URL(link);
    const path = url.pathname.split('/').filter(str => str.trim() !== '');
    console.log("PATH", path);
    if (path.length === 0) return;
    for (let i = 1; i <= path.length; i++) {
      const pathStr = path.slice(0, i).join('/');
      if (!pathCounts[pathStr]) {
        pathCounts[pathStr] = 1;
      }
      pathCounts[pathStr]++;
    }
  });
  const sortedPaths = Object.entries(pathCounts).sort((a, b) => b[1] - a[1]);
  const highestFrequencyPath = sortedPaths[0][0];
  const lowestFrequencyPath = sortedPaths[sortedPaths.length - 1][0];
  const midFrequency = Math.floor((pathCounts[highestFrequencyPath] + pathCounts[lowestFrequencyPath]) / 2);
  const guessedRootPath = sortedPaths.find(path => {
    return path[1] >= midFrequency
  });
  console.log("GUESSED ROOT PATH", guessedRootPath);
  if (!guessedRootPath) {
    console.log("No suitable root path found, returning all links");
    return links; // Return all links if no suitable root path is found
  }
  //check from gpt if guessedRootPath is correct or not
  const filteredLinks = links.filter(link => {
    const url = new URL(link);
    return url.pathname.startsWith(`/${guessedRootPath[0]}`);
  });
  console.log("FILTERED LINKS", filteredLinks);
  return filteredLinks;
}
function getDocumentsFromContent(contentlist: { [key: string]: string }): Document<Record<string, any>>[] {
  const docs = Object.entries(contentlist).map(([key, value]) => {
    return new Document({
      pageContent: value,
      metadata: { source: key },
    });
  });
  return docs;
}
async function getCollectionName(web_url:string): Promise<string> {
  const systemPrompt = `You are an Ai collection name sorter for qdrant. Give the collection name for the given url source.
  RULES:
  - The response should be in JSON format with a single key "content" and the value should be the collection name.
  Example: 
    ME: "https://chaidocs.vercel.app/youtube/chai-aur-devops/nginx-rate-limiting/",
    You : {"content" : "chaidocs" }
    ME: "https://solana.com/docs",
    You : {"content" : "solana" }
    ME : "https://developer.mozilla.org/en-US/docs/Web/API/URL"
    You : {"content" : "mozilla" }

  `
 const model = ai.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 1.5,
    responseMimeType: "application/json",
  },
  systemInstruction: {
    role: "system",
    parts: [{ text: systemPrompt }],
  }
});
  const {response} = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: web_url }] }],
});
  const final:{
    content: string;
  } = JSON.parse(response.text().trim());
  console.log("RESPONSE", final.content);
  return final.content;
}
async function storeToqdrant(collectionName:string, documentArray:Document<Record<string, any>>[]) {
    try {
        await QdrantVectorStore.fromDocuments(
        documentArray,
        embeddings,
        {url: 'http://localhost:6333',
        collectionName,
        }
       )
        console.log(`Stored  documents in Qdrant collection: ${collectionName}`);
    } catch (error) {
        
    }
}
export async function run(url:string) {
  try {
    const contentlist = await Getalldocsdata(url);
    // const docs = loadobject(uri);
    const docs = getDocumentsFromContent(contentlist);
    const collectionName = await getCollectionName(url);
    await storeToqdrant(collectionName, docs);
    return{
      Status: true,
      message : "docs stored successfully",
    }
  } catch (error:any) {
     console.error(error);
     return {
      Status: false,
      message: `Error processing URL: ${error.message}`,
      }
  }
}



export async function pdfUPLOAD(name:string,path:string,key:string) {
 try {
   const outputPath = `./temp/${name+key}`;
   const res=  await downloadPdfFromS3(key,outputPath);
   console.log(res);
   if (!fs.existsSync(outputPath)) {
     console.error(`File not found at path: ${outputPath}`);
     return { Status: false, message: `File not found at path: ${outputPath}` };
    }
    const loader=new PDFLoader(outputPath)
    const docs= await loader.load();
    
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 220,
    });
    const splitDocs = await splitter.splitDocuments(docs);
    
    const embeddings= new GoogleGenerativeAIEmbeddings({
      modelName: 'text-embedding-004',
      apiKey: process.env.APIKEY,
    })
    
    const collectionName= name+key.slice(0,6);
    await QdrantVectorStore.fromDocuments(
      splitDocs,
      embeddings,
    {url: process.env.QDRANT_URL ,
    collectionName,
    }
  )
  
  fs.unlinkSync(outputPath);
  console.log(`Temporary file ${outputPath} deleted successfully.`);
  
  const {message ,status}= await deletePdfFromS3(key);
  if (!status) {
    console.error(message);
    return { Status: false, message };
  }
  
  return { Status: true, message: `PDF processed and stored successfully in Qdrant collection: chai-docs` };
 } catch (error: any) {
  console.error(error);
  return { Status: false, message: `Error processing PDF: ${error.message}` };
 } 

}
export async function downloadPdfFromS3(
  key: string,
  outputPath: string
): Promise<{ message: string; status: boolean }> {

  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:4566",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test"
    },
    forcePathStyle: true
  });

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    });

    const response = await s3.send(command);

    const stream = response.Body;
    if (stream instanceof Readable) {
        mkdirSync(dirname(outputPath), { recursive: true });
      const writeStream = createWriteStream(outputPath);

      await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      return {
        message: `PDF downloaded successfully to ${outputPath}`,
        status: true
      };
    } else {
      return {
        message: "Error: S3 response Body is not a Node.js Readable stream.",
        status: false
      };
    }
  } catch (error) {
    console.error("Error downloading from S3:", error);
    return {
      message: `Exception during S3 download: ${error}`,
      status: false
    };
  }
}
export async function deletePdfFromS3(key: string): Promise< { message: string; status: boolean }> {
  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:4566",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test"
    },
    forcePathStyle: true
  });
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    });
    await s3.send(deleteCommand);
    console.log(`PDF with key ${key} deleted successfully from S3.`);
    return {
      message: `PDF with key ${key} deleted successfully from S3.`,
      status: true
    }
  } catch (error) {
    console.error(`Error deleting PDF with key ${key} from S3:`, error);
    return {
      message: `Error deleting PDF with key ${key} from S3: ${error}`,
      status: false
    }
  }
}