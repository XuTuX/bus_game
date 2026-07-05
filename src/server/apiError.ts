import { NextResponse } from "next/server";

export function jsonError(error: unknown, status = 500) {
  return NextResponse.json({ error: getErrorMessage(error) }, { status });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리에 실패했습니다.";
}
