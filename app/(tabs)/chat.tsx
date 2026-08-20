import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useNova } from '../../src/state/NovaProvider';
import { colors, radii } from '../../src/ui/theme';
export default function ChatScreen(){
  const {activeChat,sendMessage,createChat,backendConnected,streamingReply}=useNova();
  const [text,setText]=useState('');
  const listRef=useRef<FlatList>(null);
  const submit=()=>{ if(!text.trim())return; sendMessage(text); setText(''); requestAnimationFrame(()=>listRef.current?.scrollToEnd({animated:true})); };
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.flex}>
    <View style={s.header}>
      <View><Text style={s.eyebrow}>{backendConnected?'NOVA / CONNECTED':'NOVA / OFFLINE WORKSPACE'}</Text><Text style={s.title}>Chat</Text></View>
      <View style={s.headerActions}>
        <Pressable onPress={()=>router.push('/backend')} style={s.icon}><Ionicons name={backendConnected?'cloud-done-outline':'cloud-offline-outline'} size={20} color={backendConnected?colors.success:colors.muted}/></Pressable>
        <Pressable onPress={createChat} style={s.icon}><Ionicons name="create-outline" size={21} color={colors.text}/></Pressable>
      </View>
    </View>
    <View style={s.context}>
      <View style={[s.live,{backgroundColor:backendConnected?colors.success:colors.muted}]}/>
      <Text style={s.contextText}>{backendConnected?'Live AI backend connected':'Local heuristics only'}</Text>
      {streamingReply?<ActivityIndicator size="small" color={colors.primary} style={s.spinner}/>:<Text style={s.contextMeta}>{backendConnected?'streaming + RAG + tools':'6 tools ready'}</Text>}
    </View>
    <FlatList
      ref={listRef}
      data={activeChat.messages}
      keyExtractor={m=>m.id}
      contentContainerStyle={s.messages}
      onContentSizeChange={()=>listRef.current?.scrollToEnd({animated:true})}
      renderItem={({item})=>
        <View style={[s.message,item.role==='user'?s.userMessage:s.assistantMessage,item.error&&s.errorMessage]}>
          <Text style={s.role}>{item.role==='user'?'YOU':'NOVA'}{item.tool?`  ·  ${item.tool.toUpperCase()}`:''}</Text>
          {item.pending&&!item.text?<ActivityIndicator size="small" color={colors.primary}/>:<Text style={[s.messageText,item.error&&s.errorText]}>{item.text}{item.pending?' ▍':''}</Text>}
        </View>}
      ListEmptyComponent={<View style={s.empty}><Text style={s.emptyTitle}>Start a useful conversation</Text><Text style={s.emptyText}>Ask Nova to reason, plan, summarize, remember, or calculate.{!backendConnected?' Connect a backend for real AI replies.':''}</Text></View>}/>
    <View style={s.composer}>
      <TextInput value={text} onChangeText={setText} onSubmitEditing={submit} placeholder="Ask Nova anything" placeholderTextColor={colors.muted} style={s.input} multiline/>
      <Pressable onPress={submit} style={s.send}><Ionicons name="arrow-up" size={20} color={colors.bg}/></Pressable>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.bg},flex:{flex:1},header:{paddingHorizontal:20,paddingTop:12,paddingBottom:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},headerActions:{flexDirection:'row',gap:8},eyebrow:{fontSize:10,letterSpacing:1.5,color:colors.primary,fontWeight:'700'},title:{color:colors.text,fontSize:32,fontWeight:'800',marginTop:4},icon:{backgroundColor:colors.surface2,borderRadius:radii.sm,padding:10},context:{marginHorizontal:20,backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radii.md,padding:13,flexDirection:'row',alignItems:'center',gap:8},live:{width:8,height:8,borderRadius:4,backgroundColor:colors.success},contextText:{color:colors.text,fontSize:12,fontWeight:'700'},contextMeta:{color:colors.muted,fontSize:12,marginLeft:'auto'},spinner:{marginLeft:'auto'},messages:{padding:20,gap:12,flexGrow:1},message:{borderRadius:radii.md,padding:15,maxWidth:'88%'},assistantMessage:{backgroundColor:colors.surface,alignSelf:'flex-start',borderTopLeftRadius:4},userMessage:{backgroundColor:colors.surface2,alignSelf:'flex-end',borderTopRightRadius:4},errorMessage:{borderWidth:1,borderColor:'#ff6b6b'},role:{fontSize:10,letterSpacing:1.2,color:colors.primary,fontWeight:'800',marginBottom:7},messageText:{color:colors.text,fontSize:15,lineHeight:22},errorText:{color:'#ff9b9b'},empty:{flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:35},emptyTitle:{color:colors.text,fontWeight:'800',fontSize:20,textAlign:'center'},emptyText:{color:colors.muted,textAlign:'center',fontSize:14,lineHeight:21,marginTop:8},composer:{margin:12,padding:8,backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radii.lg,flexDirection:'row',alignItems:'flex-end'},input:{flex:1,color:colors.text,fontSize:15,maxHeight:100,paddingHorizontal:10,paddingVertical:8},send:{backgroundColor:colors.primary,borderRadius:20,padding:10}});
