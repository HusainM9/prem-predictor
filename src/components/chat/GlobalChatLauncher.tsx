"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/ChatPanel";

const HIDE_ON_PATHS = new Set(["/login", "/signup"]);

export function GlobalChatLauncher() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
      if (!session) setOpen(false);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  if (pathname && HIDE_ON_PATHS.has(pathname)) return null;
  if (!authed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open && (
        <div className="mb-2 w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[420px] sm:max-w-[calc(100vw-2rem)] lg:w-[520px]">
          <ChatPanel
            scope="general"
            title="Global chat"
            messageListClassName="h-[280px] sm:h-[340px] lg:h-[420px]"
          />
        </div>
      )}
      <Button
        type="button"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close global chat" : "Open global chat"}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </Button>
    </div>
  );
}

