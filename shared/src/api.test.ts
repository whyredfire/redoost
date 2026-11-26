import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { ApiError, createApi, detailMessage } from "./api";

interface Seen {
  path: string;
  method: string;
  headers: Headers;
  body: string;
}

const seen: Seen[] = [];
let reply = () => Response.json([]);

const server = Bun.serve({
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);

    seen.push({
      path: `${url.pathname}${url.search}`,
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    });

    return reply();
  },
});

const { origin } = server.url;

afterAll(async () => {
  await server.stop();
});

beforeEach(() => {
  seen.length = 0;
  reply = () => Response.json([]);
});

describe("detailMessage", () => {
  test("reads string and list details", () => {
    const list = { detail: [{ msg: "Bad slug" }, { msg: "Too long" }] };

    expect(detailMessage({ detail: "Site not found." }, 404)).toBe(
      "Site not found."
    );
    expect(detailMessage(list, 422)).toBe("Bad slug; Too long");
    expect(detailMessage(null, 502)).toBe("Request failed (502).");
    expect(detailMessage({}, 500)).toBe("Request failed (500).");
  });
});

describe("createApi", () => {
  test("sends the token to the server it was given", async () => {
    await createApi({ server: origin, token: "secret" }).listDeployments();

    expect(seen[0]?.path).toBe("/api/deployments");
    expect(seen[0]?.headers.get("Authorization")).toBe("Bearer secret");
  });

  test("sends no Authorization header without a token", async () => {
    await createApi({ server: origin }).readLimits();

    expect(seen[0]?.path).toBe("/api/deployments/limits");
    expect(seen[0]?.headers.has("Authorization")).toBe(false);
  });

  test("sends JSON bodies", async () => {
    reply = () => Response.json({ slug: "a" });
    await createApi({ server: origin }).changeDeployment("a", {
      expires_at: null,
    });

    expect(seen[0]?.method).toBe("PATCH");
    expect(seen[0]?.body).toBe('{"expires_at":null}');
    expect(seen[0]?.headers.get("Content-Type")).toBe("application/json");
  });

  test("throws ApiError with the server's message", async () => {
    reply = () =>
      Response.json({ detail: "That address is taken." }, { status: 409 });
    const reading = createApi({ server: origin }).readDeployment("a");

    await expect(reading).rejects.toBeInstanceOf(ApiError);
    await expect(reading).rejects.toMatchObject({
      status: 409,
      message: "That address is taken.",
    });
  });

  test("throws for error responses without a JSON body", async () => {
    reply = () => new Response("Bad gateway", { status: 502 });

    await expect(
      createApi({ server: origin }).deleteDeployment("a")
    ).rejects.toMatchObject({ status: 502, message: "Request failed (502)." });
  });

  test("accepts empty responses where nothing is returned", async () => {
    reply = () => new Response(null, { status: 204 });

    expect(
      await createApi({ server: origin }).revokeCurrentToken()
    ).toBeUndefined();
    expect(seen[0]?.method).toBe("DELETE");
    expect(seen[0]?.path).toBe("/api/auth/tokens/current");
  });

  test("puts bulk slugs in the query", async () => {
    reply = () => Response.json({ deleted: ["a"] });

    const result = await createApi({ server: origin }).deleteDeployments([
      "a",
      "b c",
    ]);

    expect(seen[0]?.path).toBe("/api/deployments?slug=a&slug=b+c");
    expect(result).toEqual({ deleted: ["a"] });
  });

  test("waits for a CLI sign-in until it's approved", async () => {
    const signedIn = { token: "t", user: { id: "u" } };
    const claim = { secret: "s", name: "CLI on host" };
    const api = createApi({ server: origin });

    reply = () => Response.json({}, { status: 202 });
    expect(await api.claimCliLogin("id", claim)).toBeNull();
    expect(seen[0]?.path).toBe("/api/auth/cli/id/token");
    expect(seen[0]?.body).toBe('{"secret":"s","name":"CLI on host"}');

    reply = () => Response.json(signedIn);
    expect(await api.claimCliLogin("id", claim)).toMatchObject(signedIn);

    reply = () => Response.json({ detail: "Expired." }, { status: 404 });
    await expect(api.claimCliLogin("id", claim)).rejects.toMatchObject({
      status: 404,
    });
  });
});
