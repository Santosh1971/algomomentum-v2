"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ManageSymbolsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/strategies"); }, [router]);
  return null;
}
