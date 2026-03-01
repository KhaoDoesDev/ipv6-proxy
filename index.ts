import http from "http";
import net from "net";
import { randomBytes } from "crypto";
import { $, env } from "bun";

const PORT = env.PORT || 8080;

function randomIPv6() {
  const parts = randomBytes(10).toString("hex").match(/.{1,4}/g)!;
  return `${env.IPV6_PREFIX}:${parts.join(":")}`;
}

const server = http.createServer();

server.on("connect", async (req, clientSocket) => {
  if (env.USERNAME && env.PASSWORD) {
    const auth = req.headers["proxy-authorization"];

    if (!auth || !auth.startsWith("Basic ")) {
      clientSocket.write(
        "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"Proxy\"\r\n\r\n"
      );
      return clientSocket.destroy();
    }

    const base64 = auth.split(" ")[1]!;
    const [username, password] = Buffer.from(base64, "base64")
      .toString()
      .split(":");

    if (username !== env.USERNAME || password !== env.PASSWORD) {
      clientSocket.write(
        "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"Proxy\"\r\n\r\n"
      );
      return clientSocket.destroy();
    }
  }

  const [host, port] = req.url!.split(":");
  const ip = randomIPv6();

  try {
    await $`ip -6 addr add ${ip}/128 dev ${env.INTERFACE}`;
    console.log("Using IPv6:", ip);
    const serverSocket = net.connect({
      host,
      port: Number(port),
      localAddress: ip,
      family: 6
    });
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);

    let cleaned = false;

    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;

      serverSocket.destroy();
      clientSocket.destroy();

      await $`ip -6 addr del ${ip}/128 dev ${env.INTERFACE}`.quiet();
    };
    clientSocket.on("close", cleanup);
    serverSocket.on("close", cleanup);
    serverSocket.on("error", cleanup);
    clientSocket.on("error", cleanup);
  } catch (err) {
    clientSocket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Running on :${PORT}`);
});