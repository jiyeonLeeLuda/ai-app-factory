import { z } from "zod";
import { USER_MESSAGE_MAX_CHARS } from "@/lib/openai";

// 가입: 닉네임 + 이메일. 이메일은 형식 검증(zod)만 — W1은 인증에 쓰지 않음 (S2c.5).
export const signupSchema = z.object({
  nickName: z.string().trim().min(1, "닉네임을 입력해주세요.").max(40),
  email: z.string().trim().email("올바른 이메일 형식이 아닙니다."),
});
export type SignupInput = z.infer<typeof signupSchema>;

// 메시지 전송: 빈/공백 금지, 2,000자 상한 (S3).
export const sendMessageSchema = z.object({
  artistId: z.string().min(1),
  content: z
    .string()
    .trim()
    .min(1, "메시지를 입력해주세요.")
    .max(USER_MESSAGE_MAX_CHARS, `메시지는 ${USER_MESSAGE_MAX_CHARS}자를 넘을 수 없습니다.`),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
