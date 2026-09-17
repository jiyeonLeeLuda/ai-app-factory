import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setUserCookie } from "@/lib/session";
import { signupSchema } from "@/lib/validation";

export const runtime = "nodejs";

// 가입: 닉네임+이메일 → User 생성 → userId 쿠키 저장 (p1-spec S1.0)
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력을 확인해주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { nickName, email } = parsed.data;

  try {
    // 이메일은 미래 계정 승격 앵커(@unique). 이미 있으면 그 유저로 이어붙이지 않고
    // 명확히 안내 — W1은 이메일로 로그인/본인확인을 하지 않기 때문(p1-spec S2c.2).
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 이메일이에요. 다른 이메일을 사용해주세요." },
        { status: 409 },
      );
    }

    const user = await prisma.user.create({ data: { nickName, email } });
    await setUserCookie(user.id);
    return NextResponse.json({ ok: true, userId: user.id });
  } catch (error) {
    console.error("가입 실패:", error);
    return NextResponse.json(
      { error: "가입 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
