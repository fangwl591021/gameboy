// functions/lottery.js
import { serve } from "https://deno.land/std@0.180.0/http/server.ts";
import { jwtVerify, createRemoteJWKSet } from "npm:jose@4";
import { createClient } from "npm:@supabase/supabase-js";

const JWKS = createRemoteJWKSet(new URL("https://api.line.me/oauth2/v2.1/keys"));
const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // 支援 CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers:{
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type"
    }});
  }

  let data = {};
  if (req.method === "POST") {
    data = await req.json();
  } else {
    const url = new URL(req.url);
    url.searchParams.forEach((v,k)=> data[k]=v);
  }

  const { act, idToken, name, phone } = data;
  // 驗證 idToken 並取得 LINE userId
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, JWKS, {
      issuer: "https://access.line.me",
      audience: Deno.env.get("LINE_CLIENT_ID")
    }));
  } catch(err) {
    return new Response(JSON.stringify({ error:"Invalid token" }), { status:401 });
  }
  const userId = payload.sub as string;

  // 處理行為
  switch(act) {
    case "draw":
      return new Response(JSON.stringify({ ok:true }), {
        headers:{ "Access-Control-Allow-Origin":"*" }
      });

    case "winner":
      // 隨機挑獎品
      const prizes = ["A","B","C"];
      const prize = prizes[Math.floor(Math.random()*prizes.length)];
      // 寫入 Supabase
      await supa.from("winners").insert({
        user_id: userId,
        prize, name, phone,
        created_at: new Date().toISOString()
      });
      return new Response(JSON.stringify({ ok:true, prize }), {
        headers:{ "Access-Control-Allow-Origin":"*" }
      });

    case "query":
      // 查詢該 user
      const { data:records } = await supa
        .from("winners")
        .select("*")
        .eq("user_id", userId)
        .order("id", { ascending:false });
      return new Response(JSON.stringify({ ok:true, records }), {
        headers:{ "Access-Control-Allow-Origin":"*" }
      });

    case "redeem":
      await supa
        .from("winners")
        .update({ redeemed:true, redeemed_at:new Date().toISOString() })
        .eq("id", Number(data.recordId));
      return new Response(JSON.stringify({ ok:true }), {
        headers:{ "Access-Control-Allow-Origin":"*" }
      });

    default:
      return new Response(JSON.stringify({ error:"unknown act" }), {
        status:400, headers:{ "Access-Control-Allow-Origin":"*" }
      });
  }
});
