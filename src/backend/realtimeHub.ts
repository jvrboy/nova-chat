import { RealtimeMessage } from './realtime';

type SocketLike = { send: (payload: string) => void; close?: () => void };
type ConnectedPeer = { id: string; workspaceId: string; socket: SocketLike; revision: number };
export class RealtimeHub { private peers = new Map<string, ConnectedPeer>(); private revisions = new Map<string, number>(); private seen = new Set<string>();
  connect(peer: ConnectedPeer) { this.peers.set(peer.id, peer); const revision = this.revisions.get(peer.workspaceId) ?? 0; peer.revision = revision; return revision; }
  disconnect(peerId: string) { this.peers.delete(peerId); }
  nextRevision(workspaceId: string) { const revision = (this.revisions.get(workspaceId) ?? 0) + 1; this.revisions.set(workspaceId, revision); return revision; }
  receive(message: RealtimeMessage, senderId: string) { if (this.seen.has(message.messageId)) return; this.seen.add(message.messageId); const revision = message.type === 'change' ? this.nextRevision(message.workspaceId) : Math.max(message.revision, this.revisions.get(message.workspaceId) ?? 0); const normalized: RealtimeMessage = { ...message, revision, sentAt: new Date().toISOString() }; for (const peer of this.peers.values()) if (peer.workspaceId === message.workspaceId) { peer.revision = revision; peer.socket.send(JSON.stringify({ ...normalized, type: peer.id === senderId ? 'ack' : normalized.type })); } }
  broadcastSnapshot(workspaceId: string, snapshot: RealtimeMessage) { const revision = this.revisions.get(workspaceId) ?? snapshot.revision; for (const peer of this.peers.values()) if (peer.workspaceId === workspaceId) peer.socket.send(JSON.stringify({ ...snapshot, type: 'snapshot', revision, sentAt: new Date().toISOString() })); }
  closeWorkspace(workspaceId: string) { for (const peer of this.peers.values()) if (peer.workspaceId === workspaceId) peer.socket.close?.(); }
  getWorkspaceRevision(workspaceId: string) { return this.revisions.get(workspaceId) ?? 0; }
  getPeerCount(workspaceId?: string) { return [...this.peers.values()].filter((peer) => !workspaceId || peer.workspaceId === workspaceId).length; }
}
