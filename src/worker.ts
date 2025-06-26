import { chromium } from "playwright";
import fs from "fs";
import {  GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAI as GoogleGenAI } from "@google/generative-ai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

if (!process.env.APIKEY) {
  throw new Error("APIKEY is not set in the environment variables");
}
const ai = new GoogleGenAI(process.env.APIKEY as string);
const embeddings = new GoogleGenerativeAIEmbeddings({
  modelName: 'text-embedding-004',
  apiKey: process.env.APIKEY,
})
const qdrantClient = new QdrantClient({ url: 'http://localhost:6333' });

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
    fs.writeFileSync(urlObj.hostname + ".json", JSON.stringify(contentlist, null, 2));
  
  return urlObj;
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
function loadobject(urlObj:URL): Document[] {
  const file = fs.readFileSync(urlObj.hostname + ".json", "utf-8");
  const jsonData :{
    [key: string]: string
  } = JSON.parse(file);
  const docs = Object.entries(jsonData).map(([key, value]) => {
    return new Document({
      pageContent: value,
      metadata: { source: key },
    })
  });
  return docs;
}

//! Remove This Collection name will be generated only one by Ai 
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
async function getQueries(query:string) {
const systemPrompt = ``
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
  contents: [{ role: "user", parts: [{ text: query }] }],
});
  const final = response.text().trim();
}
//this will be queries of array generated by getQueries
async function getSourcesFromQueries(queries:string) {
  const collections = await qdrantClient.getCollections();
  const names = collections.collections.map((name) => name.name);
  const systemPrompt = `You are an expert ai in predecting the collection name from the given collection name in qdrant for qdrant from query  
  Collections: ${names}
  Rules:
  - give one word answer
  - if any query can have 2 collection name then also choose any one
  Example: Query: What is html?
          You : html
          Query : what are joins in sql?
          You : sql
          Query : what is nginix?
          You : devops 
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
  contents: [{ role: "user", parts: [{ text: queries }] }],
});
  const final = response.text().trim();



  const ret = new QdrantVectorStore(embeddings, {
    url: 'http://localhost:6333', collectionName: final,
  })
  const fetch = await ret.similaritySearch(queries);
  const sources = fetch.map((doc) => doc.metadata.source);
  const filterunique = sources.filter((url, index, self) => self.indexOf(url) == index).slice(0, 3);
  return filterunique;
  
}
async function getdatafromsources(sources:string[]) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const context = [];
  for (let source of sources) {
    await page.goto(source, { waitUntil: "domcontentloaded" });
    const content = await page.$eval("body", e => e.innerText);
    const cleanedText = content.replace(/\n+/g, ' ');
    context.push(cleanedText);
  }
  await browser.close();
  return context;
}
async function ask(query:string) {
  const queries = getQueries(query);
  const sources = await getSourcesFromQueries(query);
  const context = await getdatafromsources(sources);
  const systemPrompt = `You are a helpful assistant that can answer questions from the provided context and give mid-long answers in structured way with emojies implementation and short analogies and remember to add sources in bulletpoint
    Context: ${context} Sources: ${sources}
    Note: if there is no context or sources then say "Your query doesn't match with the context of this chat ask something else 😅" and dont give any answer
    Example:
    Me- What is Html?
    You- HTML stands for HyperText Markup Language. It's basically the building blocks of any website. It tells your browser how to display things like text, images, headings, and links on a webpage. You don’t need to be an expert to start building websites. Learning the basics—like how to create a page layout, add text, images, and links—can be done in a weekend. Once you get those down, you’re good to go.
        HTML5 is the latest version of HTML. It brings new features and improvements, including:
        New semantic elements: <header>, <footer>, <section>, <article>
        Built-in support for audio, video, and graphics:
        <audio>, <video>, <canvas>
        Improved form controls: <input type="date">, <input type="range">
        🧪 HTML5 Example:
        html
        Copy
        Edit
        <article>
          <header>
            <h2>Learning HTML5</h2>
          </header>
          <p>HTML5 makes web development simpler and more powerful.</p>
          <video controls>
            <source src="demo.mp4" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </article>
        📘 How Much HTML Do You Need to Learn?
        You only need the basics to get started. Focus on these key elements:
        Structure: <html>, <head>, <body>
        Content: <h1> to <h6>, <p>, <a>, <img>
        Lists: <ul>, <ol>, <li>
        Forms: <form>, <input>, <button>
        With just these, you can create your first real web page!
        
        Sources: 
          - https://chaidocs.vercel.app/youtube/chai-aur-html/introduction/
          - https://chaidocs.vercel.app/youtube/chai-aur-html/html-tags/
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
  contents: [{ role: "user", parts: [{ text: query }] }],
});
  const final = response.text;
  console.log(final);
}
export async function run(url:string) {
  const uri = new URL(url);
  const urlObj = await Getalldocsdata(url);
  const docs = loadobject(uri);//prefred way
  const collectionName = await getCollectionName(url);
  console.log(collectionName)
  const store = await storeToqdrant(collectionName, docs);



  //* optional
  // const loader=new JSONLoader("./chaidocs.vercel.app.json");
  // const docs= await loader.load();
  //* optional
  // const chunks = new RecursiveCharacterTextSplitter({
  //   chunkOverlap: 200,
  //   chunkSize: 1000
  // })
  // const textChunks = await chunks.splitDocuments(docs);
  // console.log(textChunks.length);
  return{
    Status: true,
    collectionName,
  }
}
// run("https://solana.com/docs");
ask("What is life?")


async function pdfUPLOAD() {
  const loader=new PDFLoader("./raw.pdf")
const docs= await loader.load();

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});
const splitDocs = await splitter.splitDocuments(docs);

const embeddings= new GoogleGenerativeAIEmbeddings({
    modelName: 'text-embedding-004',
    apiKey: 'AIzaSyDp1TIHNuVXFKB9kk9TjkLS9q6PGqzA_O0',
})


const store = await QdrantVectorStore.fromDocuments(
  splitDocs,
  embeddings,
  {url: 'http://localhost:6333',
  collectionName:"chai-docs",
  }
)
}
// async function downloadPdfFromS3(bucket, key, outputPath) {
//   const s3 = new S3Client({
//     region: "INDIA ",
//     credentials: {
//       accessKeyId: "YOUR_AWS_KEY",
//       secretAccessKey: "YOUR_AWS_SECRET",
//     },
//   });

//   const command = new GetObjectCommand({ Bucket: bucket, Key: key });
//   const response = await s3.send(command);

//   const stream = response.Body;
//   const writeStream = createWriteStream(outputPath);
//   await new Promise((resolve, reject) => {
//     stream.pipe(writeStream);
//     stream.on("end", resolve);
//     stream.on("error", reject);
//   });
// }
