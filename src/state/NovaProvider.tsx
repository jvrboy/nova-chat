import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Chat = { id:string; title:string; messages:{id:string; role:'user'|'assistant'; text:string; tool?:string}[]; updatedAt:string };
export type Project = { id:string; name:string; description:string; color:string; files:number };
export type Tool = { id:string; name:string; description:string; icon:string; category:string };

type NovaContextValue = { chats:Chat[]; projects:Project[]; tools:Tool[]; activeChat:Chat; createChat:()=>void; sendMessage:(text:string)=>void; toggleProject:(id:string)=>void };
const tools:Tool[] = [
 {id:'memory',name:'Memory Vault',description:'Recall, store, and organize durable knowledge.',icon:'brain',category:'Cognition'},
 {id:'reasoning',name:'Reasoning Chain',description:'Break complex questions into clear steps.',icon:'git-branch',category:'Cognition'},
 {id:'learning',name:'Learning Loop',description:'Turn feedback into reusable improvements.',icon:'book-open',category:'Cognition'},
 {id:'calculator',name:'Calculator',description:'Evaluate expressions and unit conversions.',icon:'calculator',category:'Utilities'},
 {id:'summarize',name:'Summarizer',description:'Compress long notes into useful briefs.',icon:'scan',category:'Utilities'},
 {id:'planner',name:'Project Planner',description:'Create milestones, tasks, and next actions.',icon:'list',category:'Productivity'},
];
const initialChats:Chat[] = [{id:'nova',title:'New conversation',updatedAt:'Now',messages:[{id:'welcome',role:'assistant',text:'I’m Nova. I can help you think, build, plan, and remember — entirely on this device.'}]}];
const initialProjects:Project[] = [{id:'mobile',name:'Mobile workspace',description:'Your converted Expo command center.',color:'#55d6ff',files:12},{id:'ideas',name:'Ideas lab',description:'Capture and develop new directions.',color:'#a78bfa',files:7}];
const NovaContext = createContext<NovaContextValue | null>(null);
export function NovaProvider({children}:{children:React.ReactNode}) { const [chats,setChats]=useState(initialChats); const [projects]=useState(initialProjects); useEffect(()=>{AsyncStorage.getItem('nova.chats').then(v=>v&&setChats(JSON.parse(v)));},[]); useEffect(()=>{AsyncStorage.setItem('nova.chats',JSON.stringify(chats));},[chats]); const activeChat=chats[0]; const createChat=()=>setChats(v=>[{id:Date.now().toString(),title:'New conversation',updatedAt:'Now',messages:[]},...v]); const sendMessage=(text:string)=>{const t=text.trim(); if(!t)return; setChats(v=>v.map((c,i)=>i?c:{...c,title:c.messages.length?'New conversation':t.slice(0,28),updatedAt:'Now',messages:[...c.messages,{id:Date.now().toString(),role:'user',text:t},{id:`a${Date.now()}`,role:'assistant',text:reply(t),tool:toolFor(t)}]}));}; const value=useMemo(()=>({chats,projects,tools,activeChat,createChat,sendMessage,toggleProject:()=>{} }),[chats,projects,activeChat]); return <NovaContext.Provider value={value}>{children}</NovaContext.Provider> }
export function useNova(){const value=useContext(NovaContext); if(!value)throw new Error('useNova must be used inside NovaProvider'); return value;}
function toolFor(text:string){const x=text.toLowerCase(); if(x.includes('remember')||x.includes('memory'))return 'Memory Vault'; if(x.includes('plan'))return 'Project Planner'; if(x.includes('calculate')||x.match(/[0-9]\s*[+*\-/]\s*[0-9]/))return 'Calculator'; if(x.includes('summar'))return 'Summarizer'; return undefined;}
function reply(text:string){const tool=toolFor(text); if(tool==='Memory Vault')return 'I can keep that in your local Memory Vault. What should I label this memory?'; if(tool==='Project Planner')return 'Let’s make it actionable. I’d start with a clear outcome, three milestones, and one next action for today.'; if(tool==='Calculator')return 'Calculator is ready. Send an expression like 18 * 4 or 120 / 8.'; if(tool==='Summarizer')return 'Paste the notes you want condensed and I’ll turn them into a focused brief.'; return 'That’s a good direction. I can help you explore it, turn it into a plan, or save the useful parts to memory.';}
