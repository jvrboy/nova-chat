import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { scheduleLocalNotification } from '../src/platform/capabilities';
import { useNova } from '../src/state/NovaProvider';
import { useBackend } from '../src/backend/BackendProvider';
import { backendRegisterPushToken } from '../src/backend/novaApi';
import { colors, radii } from '../src/ui/theme';
export default function NotificationsScreen(){const {capabilities,requestPermission}=useNova();const {config,health}=useBackend();const backendConnected=config.mode==='remote'&&Boolean(config.baseUrl)&&health.status==='healthy';const [registering,setRegistering]=useState(false);const [registered,setRegistered]=useState(false);const test=async()=>{const ok=await scheduleLocalNotification('Nova is ready','Your local job queue is available.',{route:'/operations'});Alert.alert(ok?'Notification scheduled':'Notifications unavailable',ok?'Tap the notification to return to Nova Runs.':'Use a native development build and grant notification permission.');};
  const registerBackendPush=async()=>{
    if(!backendConnected){Alert.alert('Backend not connected','Connect a backend in Settings → Backend before registering for server-driven push notifications (job completion, approvals, alerts).');return;}
    setRegistering(true);
    try{
      const granted=await requestPermission('notifications');
      if(granted!=='granted'){Alert.alert('Permission needed','Grant notification permission to receive job/approval/alert push notifications.');return;}
      const projectId=Constants.expoConfig?.extra?.eas?.projectId as string|undefined;
      const tokenResponse=await Notifications.getExpoPushTokenAsync(projectId?{projectId}:undefined);
      const platform=Platform.OS==='ios'?'ios':Platform.OS==='android'?'android':'web';
      await backendRegisterPushToken(config,tokenResponse.data,platform);
      setRegistered(true);
      Alert.alert('Registered','This device will now receive push notifications for job completions, approval decisions, and alert incidents.');
    }catch(error){Alert.alert('Registration failed',error instanceof Error?error.message:'Could not register push token.');}
    finally{setRegistering(false);}
  };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}><View style={s.header}><View><Text style={s.eyebrow}>NOVA / DELIVERY</Text><Text style={s.title}>Notifications</Text></View><Pressable style={s.close} onPress={()=>router.back()}><Ionicons name="close" size={20} color={colors.text}/></Pressable></View><Text style={s.subtitle}>Local alerts stay on-device and can deep-link back to a run or approval gate.</Text><View style={s.card}><Ionicons name="notifications-outline" size={26} color={colors.primary}/><Text style={s.cardTitle}>Test the local channel</Text><Text style={s.copy}>On web and Expo Go, Nova explains the fallback instead of attempting unsupported native delivery.</Text><Pressable style={s.primary} onPress={test}><Text style={s.primaryText}>Send test notification</Text></Pressable></View><View style={s.card}><Ionicons name="cloud-outline" size={26} color={colors.primary}/><Text style={s.cardTitle}>Server-driven push</Text><Text style={s.copy}>{backendConnected?'Register this device to get pushed when a backend job completes, an approval is decided, or an alert fires — even while the app is closed.':'Connect a backend (Settings → Backend) to enable push notifications for job completion, approvals, and alerts.'}</Text><Pressable style={[s.primary,!backendConnected&&s.disabled]} disabled={!backendConnected||registering} onPress={()=>void registerBackendPush()}><Text style={s.primaryText}>{registering?'Registering…':registered?'Registered ✓':'Register this device'}</Text></Pressable></View><Capability label="Notifications" value={capabilities.notifications} onPress={()=>requestPermission('notifications')}/><Text style={s.section}>Permission model</Text><Text style={s.copy}>Nova requests access only when a feature needs it. Denials remain recoverable through this screen or the operating system settings.</Text></ScrollView></SafeAreaView>}
function Capability({label,value,onPress}:{label:string;value:string;onPress:()=>void}){return <View style={s.cap}><View><Text style={s.label}>{label}</Text><Text style={s.copy}>{value}</Text></View><Pressable onPress={onPress}><Text style={s.manage}>{value==='granted'?'Granted':'Manage'}</Text></Pressable></View>}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.bg},content:{padding:20,gap:14},header:{flexDirection:'row',justifyContent:'space-between'},close:{width:38,height:38,borderRadius:12,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:10,letterSpacing:1.5,color:colors.primary,fontWeight:'700'},title:{color:colors.text,fontSize:32,fontWeight:'800',marginTop:4},subtitle:{color:colors.muted,fontSize:15,lineHeight:22},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radii.lg,padding:18,gap:10},cardTitle:{color:colors.text,fontSize:18,fontWeight:'800'},copy:{color:colors.muted,lineHeight:20},primary:{backgroundColor:colors.primary,borderRadius:12,padding:13,alignItems:'center',marginTop:5},disabled:{opacity:0.4},primaryText:{color:colors.bg,fontWeight:'800'},cap:{padding:15,borderRadius:radii.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},label:{color:colors.text,fontWeight:'800'},manage:{color:colors.primary,fontWeight:'800'},section:{color:colors.muted,textTransform:'uppercase',letterSpacing:1.5,fontSize:11,fontWeight:'800',marginTop:8}});
