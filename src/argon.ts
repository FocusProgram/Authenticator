import argon2 from "argon2-browser";

window.addEventListener("message", (event) => {
  const message = event.data;
  const source = event.source as Window;

  if (
    !source ||
    source !== window.parent ||
    !message ||
    typeof message.requestId !== "string"
  ) {
    return;
  }

  const reply = (payload: { response?: unknown; error?: string }) => {
    source.postMessage(
      { ...payload, requestId: message.requestId },
      event.origin === "null" ? "*" : event.origin
    );
  };

  switch (message.action) {
    case "hash":
      Argon.hash(message.value, message.salt)
        .then((hash) => {
          reply({ response: hash });
        })
        .catch((error) => reply({ error: String(error) }));
      break;

    case "verify":
      Argon.compareHash(message.hash, message.value)
        .then((result) => {
          reply({ response: result });
        })
        .catch((error) => reply({ error: String(error) }));
      break;

    default:
      break;
  }
  return;
});

class Argon {
  static async hash(value: string, salt: string | Uint8Array) {
    const hash = await argon2.hash({
      pass: value,
      salt: salt,
      time: 2,
      mem: 1024 * 19,
      parallelism: 1,
      hashLen: 32,
      type: argon2.ArgonType.Argon2id,
    });

    return hash.encoded;
  }

  static compareHash(hash: string, value: string) {
    return new Promise((resolve: (value: boolean) => void) => {
      argon2
        .verify({
          pass: value,
          encoded: hash,
        })
        .then(() => resolve(true))
        .catch((e: { message: string; code: number }) => {
          console.error("Error decoding hash", e);
          resolve(false);
        });
    });
  }
}
