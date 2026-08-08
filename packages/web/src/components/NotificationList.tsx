import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api";

type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  payload: string;
  createdAt: string;
};

export function NotificationList({ address }: { address: string | null }) {
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    if (!address) return;
    const res = await apiGet<{ notifications: Notification[] }>(
      `/notifications?address=${encodeURIComponent(address)}`,
    );
    setItems(res.notifications ?? []);
  }, [address]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 8000);
    return () => clearInterval(iv);
  }, [load]);

  if (!address) return null;
  if (!items.length) return <p className="muted">No notifications yet.</p>;

  return (
    <ul className="event-feed">
      {items.map((n) => (
        <li key={n.id}>
          <div className="event-meta">
            <span className="event-kind">{n.title}</span>
            <span className="event-step">{n.kind}</span>
            <time>{n.createdAt}</time>
          </div>
          <p>{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
