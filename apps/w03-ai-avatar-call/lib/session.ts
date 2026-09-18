import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

// ── 현재 사용자 판별을 한 모듈에 격리 (p1-spec S2c.4) ──────────────
// "누구냐"는 오직 쿠키의 userId. W2에서 쿠키→진짜 세션 교체를 여기 한 곳만 고친다.
// userId 재발급 절대 금지 (기존 대화가 주인을 잃음).

export const USER_COOKIE = "userId";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** 쿠키에서 현재 userId 문자열만 읽는다 (DB 조회 없음). */
export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}

/** 현재 사용자 row. 쿠키 없음/유저 없음이면 null (쿠키 분실 = 새 회원 취급). */
export async function getCurrentUser(): Promise<User | null> {
  const id = await getCurrentUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

/** 가입 시 쿠키 설정 (Route Handler 안에서만 호출 가능). */
export async function setUserCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
    secure: process.env.NODE_ENV === "production",
  });
}
