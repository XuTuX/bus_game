type ErrorPayload = {
  error?: string;
  message?: string;
};

export async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function getResponseErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = await parseJsonResponse<ErrorPayload>(response);
  return payload?.error || payload?.message || fallback;
}

export async function requireJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const payload = await parseJsonResponse<T & ErrorPayload>(response);

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || fallbackError);
  }

  if (payload === null) {
    throw new Error(fallbackError);
  }

  return payload;
}
