import {
  ClobClient,
  Side,
  OrderType,
  Chain,
  type ApiKeyCreds
} from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy, type Chain as ViemChain } from "viem/chains";
import { cfg } from "../config.js";

let _publicClient: ClobClient | null = null;
let _client: ClobClient | null = null;
let _clientInit: Promise<ClobClient> | null = null;

function toClobChain(id: number): Chain {
  if (id === 137) return Chain.POLYGON;
  if (id === 80002) return Chain.AMOY;
  throw new Error(`Unsupported CLOB_CHAIN_ID ${id}. Use 137 (Polygon) or 80002 (Amoy).`);
}

function toViemChain(id: number): ViemChain {
  if (id === 137) return polygon;
  if (id === 80002) return polygonAmoy;
  throw new Error(`Unsupported CLOB_CHAIN_ID ${id}. Use 137 (Polygon) or 80002 (Amoy).`);
}

function walletClientFromPrivateKey() {
  const raw = cfg.privateKey?.trim() ?? "";
  const with0x = raw.startsWith("0x") ? raw : `0x${raw}`;
  const account = privateKeyToAccount(with0x as `0x${string}`);
  return createWalletClient({
    account,
    chain: toViemChain(cfg.clobChainId),
    transport: http()
  });
}

function getPublicClient(): ClobClient {
  if (!_publicClient) {
    _publicClient = new ClobClient({
      host: cfg.clobApiUrl,
      chain: toClobChain(cfg.clobChainId)
    });
  }
  return _publicClient;
}

function hasManualClobCreds(): boolean {
  const k = (cfg.clobApiKey ?? "").trim();
  const s = (cfg.clobSecret ?? "").trim();
  const p = (cfg.clobPassphrase ?? "").trim();
  return Boolean(k && s && p);
}

async function getClient(): Promise<ClobClient> {
  if (_client) return _client;
  if (_clientInit) return _clientInit;

  _clientInit = (async () => {
    if (!cfg.privateKey?.trim()) {
      throw new Error("Live trading needs PRIVATE_KEY in .env");
    }
    const signer = walletClientFromPrivateKey();
    const clobChain = toClobChain(cfg.clobChainId);

    let creds: ApiKeyCreds;
    if (hasManualClobCreds()) {
      creds = {
        key: cfg.clobApiKey!.trim(),
        secret: cfg.clobSecret!.trim(),
        passphrase: cfg.clobPassphrase!.trim()
      };
    } else {
      const l1 = new ClobClient({ host: cfg.clobApiUrl, chain: clobChain, signer });
      creds = await l1.createOrDeriveApiKey();
    }

    _client = new ClobClient({
      host: cfg.clobApiUrl,
      chain: clobChain,
      signer,
      creds
    });
    return _client;
  })();

  try {
    return await _clientInit;
  } catch (e) {
    _clientInit = null;
    throw e;
  }
}

export type TokenIds = { yesTokenId: string; noTokenId: string };

export async function getTokenIdsForCondition(conditionId: string): Promise<TokenIds | null> {
  try {
    const client = getPublicClient();
    const market = await client.getMarket(conditionId);
    const tokens = (market as { tokens?: Array<{ outcome: string; token_id: string }> }).tokens;
    if (!tokens || tokens.length < 2) return null;
    const yesToken = tokens.find((t) => /yes|up/i.test(t.outcome ?? ""));
    const noToken = tokens.find((t) => /no|down/i.test(t.outcome ?? ""));
    if (!yesToken || !noToken) return null;
    return { yesTokenId: yesToken.token_id, noTokenId: noToken.token_id };
  } catch {
    return null;
  }
}

export type PlaceOrderParams = {
  tokenId: string;
  side: "BUY" | "SELL";
  size: number;
  price: number;
  orderType?: "GTC" | "FOK" | "FAK";
};

export type PlaceOrderResult = {
  success: boolean;
  orderID?: string;
  status?: string;
  errorMsg?: string;
};

export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const client = await getClient();
  const { tokenId, side, size, price, orderType = "GTC" } = params;
  const sideEnum = side === "BUY" ? Side.BUY : Side.SELL;

  try {
    if (orderType === "GTC") {
      const res = await client.createAndPostOrder(
        { tokenID: tokenId, price, size, side: sideEnum },
        undefined,
        OrderType.GTC
      );
      return {
        success: res.success ?? true,
        orderID: res.orderID,
        status: res.status
      };
    }
    const marketType = orderType === "FAK" ? OrderType.FAK : OrderType.FOK;
    const marketOrder = await client.createAndPostMarketOrder(
      {
        tokenID: tokenId,
        side: sideEnum,
        amount: size,
        price
      },
      undefined,
      marketType
    );
    return {
      success: marketOrder.success ?? true,
      orderID: marketOrder.orderID,
      status: marketOrder.status
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      success: false,
      errorMsg: err.message ?? String(e)
    };
  }
}

export async function buy(
  tokenId: string,
  amountUsd: number,
  priceLimit: number
): Promise<PlaceOrderResult> {
  return placeOrder({
    tokenId,
    side: "BUY",
    size: amountUsd,
    price: priceLimit,
    orderType: "FOK"
  });
}

export async function sell(
  tokenId: string,
  sizeShares: number,
  priceLimit: number
): Promise<PlaceOrderResult> {
  return placeOrder({
    tokenId,
    side: "SELL",
    size: sizeShares,
    price: priceLimit,
    orderType: "FOK"
  });
}
