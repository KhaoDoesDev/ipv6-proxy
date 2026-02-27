import http from "http";
import net from "net";
import { randomBytes } from "crypto";
import { $, env } from "bun";

const PORT = env.PORT || 8080;

function randomIPv6() {
  const parts = randomBytes(8).toString("hex").match(/.{1,4}/g)!;
  return `${env.IPV6_PREFIX}:${parts.join(":")}`;
}

const server = http.createServer();

server.on("connect", async (req, clientSocket) => {
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

    const cleanup = () => {
      $`ip -6 addr del ${ip}/128 dev ${env.INTERFACE}`.catch(() => {});
      serverSocket.destroy();
    };
    clientSocket.on("close", cleanup);
    serverSocket.on("close", cleanup);
  } catch (err) {
    clientSocket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Running on :${PORT}`);
});