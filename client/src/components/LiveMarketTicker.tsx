import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Radio } from "lucide-react";

type Ticker = { product_id?: string; price?: string; time?: string; best_bid?: string; best_ask?: string; volume_24_h?: string };
type LiveMarketTickerProps = { productIds?: string[] };

const COINBASE_WS = "wss://advanced-trade-ws.coinbase.com";

export function LiveMarketTicker({ productIds = ["BTC-USD", "ETH-USD"] }: LiveMarketTickerProps) {
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const [prices, setPrices] = useState<Record<string, Ticker>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const ids = useMemo(() => productIds.slice(0, 10), [productIds]);

  useEffect(() => {
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setStatus(attemptsRef.current ? "reconnecting" : "connecting");
      const socket = new WebSocket(COINBASE_WS);
      socketRef.current = socket;
      socket.onopen = () => {
        attemptsRef.current = 0;
        setStatus("live");
        socket.send(JSON.stringify({ type: "subscribe", channel: "ticker", product_ids: ids }));
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { events?: Array<{ tickers?: Ticker[] }> };
          const next = payload.events?.flatMap((item) => item.tickers ?? []) ?? [];
          if (!next.length) return;
          setPrices((current) => {
            const updated = { ...current };
            for (const ticker of next) if (ticker.product_id) updated[ticker.product_id] = ticker;
            return updated;
          });
        } catch {
          // Ignore malformed provider frames; the socket remains live.
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (disposed) return;
        setStatus("reconnecting");
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attemptsRef.current++, 5));
        reconnectRef.current = window.setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      setStatus("offline");
    };
  }, [ids]);

  return <section className="live-market-ticker" aria-label="Live market data">
    <div className="live-market-heading"><span><Activity size={14} /> Live markets</span><small className={`live-market-status ${status}`}><Radio size={11} /> {status === "live" ? "Live" : status === "offline" ? "Offline" : status === "connecting" ? "Connecting" : "Reconnecting"}</small></div>
    <div className="live-market-items">
      {ids.map((id) => {
        const ticker = prices[id];
        return <div className="live-market-item" key={id}><strong>{id}</strong><span>{ticker?.price ? `$${Number(ticker.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "Waiting for tick…"}</span>{ticker?.best_bid && ticker.best_ask && <small>Bid {ticker.best_bid} · Ask {ticker.best_ask}</small>}</div>;
      })}
    </div>
  </section>;
}
