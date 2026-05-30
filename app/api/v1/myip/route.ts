import { NextResponse } from "next/server";
import axios from "axios";

export async function GET() {
  const r = await axios.get("https://api.ipify.org?format=json");
  return NextResponse.json(r.data);
}
