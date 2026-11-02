export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function checkResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item: { msg: string }) => item.msg).join("; ")
      : typeof detail === "string"
        ? detail
        : `Request failed (${response.status}).`;
    throw new ApiError(response.status, message);
  }
}

export async function readResponse<T>(response: Response): Promise<T> {
  await checkResponse(response);
  return response.json() as Promise<T>;
}

export function authorization(token: string) {
  return { Authorization: `Bearer ${token}` };
}
