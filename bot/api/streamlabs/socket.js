import io from "socket.io-client";

/**
 * Connect to Streamlabs Socket API
 *
 * @param {Object} options
 * @param {string} options.socketToken
 * @param {Function} options.onDonation
 * @param {Function} options.onConnected
 * @param {Function} options.onDisconnected
 * @param {Function} options.onError
 */

export function connectStreamlabs({
  socketToken,
  onDonation,
  onConnected,
  onDisconnected,
  onError,
}) {
  if (!socketToken) {
    throw new Error("[Streamlabs]: Missking Token");
  }

  const socket = io(
    "https://sockets.streamlabs.com?token=" + socketToken,
    {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    }
  );

  socket.on("connect", () => {
    console.log("[Streamlabs]: Connected");
    onConnected?.();
  });

  socket.on("disconnect", (reason) => {
    console.log("[Streamlabs] Disconnected:", reason);
    onDisconnected?.(reason);
  });

  socket.on("connect_error", (err) => {
    console.error("[Streamlabs] Connection error:", err?.message || err);
    onError?.(err);
  });

  socket.on("event", (eventData) => {
    try {
      const eventType = String(eventData?.type || eventData?.event || "")
        .trim()
        .toLowerCase();
      if (eventType !== "donation") return;

      const rawMessage = eventData?.message;
      const list = Array.isArray(rawMessage)
        ? rawMessage
        : rawMessage
          ? [rawMessage]
          : [];

      for (const d of list) {
        const amountRaw =
          d?.amount ??
          d?.amount_raw ??
          d?.amount_value ??
          d?.formatted_amount ??
          d?.amount_formatted ??
          d?.formattedAmount ??
          0;

        const donation = {
          name: String(d?.name ?? d?.from ?? d?.username ?? "Someone"),
          amount: amountRaw,
          amount_raw: d?.amount_raw ?? amountRaw,
          amount_formatted:
            d?.amount_formatted ?? d?.formatted_amount ?? d?.formattedAmount ?? "",
          formatted_amount:
            d?.formatted_amount ?? d?.amount_formatted ?? d?.formattedAmount ?? "",
          currency: String(
            d?.currency ?? d?.currency_code ?? d?.currencyCode ?? ""
          ).toUpperCase(),
          currency_symbol: String(d?.currency_symbol ?? d?.currencySymbol ?? "").trim(),
          message: String(d?.message ?? "").trim(),
          raw: d,
        };

        if (
          !donation.amount_formatted &&
          donation.currency &&
          donation.amount != null &&
          String(donation.amount).trim() !== ""
        ) {
          donation.amount_formatted = `${donation.amount} ${donation.currency}`;
          donation.formatted_amount = donation.amount_formatted;
        }

        donation.formattedAmount =
          donation.amount_formatted ||
          donation.formatted_amount ||
          String(donation.amount ?? 0);

        onDonation?.(donation);
      }
    } catch (err) {
      console.error("[Streamlabs] Event parse error:", err);
      onError?.(err);
    }
  });

  return socket;
}
