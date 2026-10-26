"use client";

import { useEffect, useState } from "react";
import MathMarkdown from "@zoeskoul/learner-workspace/ui/markdown/MathMarkdown";
import { nextZoeResponseTypingLength } from "@/lib/build/zoeResponseTyping";
import styles from "./ZoeAssistantMessage.module.css";
import type { ZoeChatTurn } from "@/lib/build/zoeChatTurns";

/** The shared package owns Markdown, math, links, tables and code blocks.
 * Reveals only a completed model response; it does not simulate streamed tokens.
 * Screen readers receive the full text during the visual typing effect.
 */
export default function ZoeAssistantMessage({ message, role, animate }: Readonly<{
  message: string;
  role: ZoeChatTurn["role"];
  animate: boolean;
}>) {
  const reveal = animate && role === "assistant";
  const [length, setLength] = useState(() => reveal ? 0 : message.length);

  useEffect(() => {
    if (!reveal || typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
      document.visibilityState === "hidden") {
      setLength(message.length);
      return;
    }

    const interval = window.setInterval(() => {
      setLength(previous => {
        const next = nextZoeResponseTypingLength(previous, message.length);
        if (next >= message.length) window.clearInterval(interval);
        return next;
      });
    }, 35);
    return () => window.clearInterval(interval);
  }, [message, reveal]);

  if (role === "user") {
    return (
      <article className={`zb-project-assistant-message ${styles.bubble} ${styles.userBubble}`}
        data-chat-role="user">
        <span className={styles.userText}>{message}</span>
      </article>
    );
  }

  const typing = reveal && length < message.length;
  return (
    <article className={`zb-project-assistant-message ${styles.bubble} ${styles.assistantBubble}`}
      data-chat-role="assistant" aria-label={typing ? message : undefined}>
      <div className={`${styles.content} ${typing ? styles.typing : ""}`}
        aria-hidden={typing ? true : undefined}>
        <MathMarkdown content={message.slice(0, length)} className={styles.markdown} />
        {typing ? <span className={styles.cursor} aria-hidden="true" /> : null}
      </div>
    </article>
  );
}
