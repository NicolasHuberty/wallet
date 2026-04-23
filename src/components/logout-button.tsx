"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Button } from "./ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7 text-sidebar-foreground/60 hover:text-sidebar-foreground"
      title="Se déconnecter"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await signOut();
          router.push("/login");
          router.refresh();
        });
      }}
    >
      <LogOut className="size-3.5" />
    </Button>
  );
}
