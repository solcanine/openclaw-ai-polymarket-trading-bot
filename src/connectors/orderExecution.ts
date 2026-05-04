import {
  ClobClient,
  Side,
  OrderType,
  Chain,
  SignatureTypeV2,
  type ApiKeyCreds,
  type BuilderConfig,
  type ClobToken,
  type MarketDetails
} from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy, type Chain as ViemChain } from "viem/chains";
import { cfg } from "../config.js";
import { parseClobSignatureLabel, signatureTypeV2FromLabel } from "../clobSignature.js";

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

function clobAuthOptions(): {
  signatureType: SignatureTypeV2;
  funderAddress?: string;
  builderConfig?: BuilderConfig;
  useServerTime?: boolean;
} {
  const label = parseClobSignatureLabel(cfg.clobSignatureType);
  const signatureType = signatureTypeV2FromLabel(label);
  const funder =
    label === "EOA"
      ? cfg.clobFunderAddress?.trim() || undefined
      : cfg.clobFunderAddress?.trim() || undefined;
  const builderCode = cfg.clobBuilderCode?.trim();
  const builderConfig: BuilderConfig | undefined = builderCode
    ? { builderCode }
    : undefined;
  return {
    signatureType,
    funderAddress: funder,
    builderConfig,
    useServerTime: cfg.clobUseServerTime ? true : undefined
  };
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
    const auth = clobAuthOptions();

    let creds: ApiKeyCreds;
    if (hasManualClobCreds()) {
      creds = {
        key: cfg.clobApiKey!.trim(),
        secret: cfg.clobSecret!.trim(),
        passphrase: cfg.clobPassphrase!.trim()
      };
    } else {
      const l1 = new ClobClient({
        host: cfg.clobApiUrl,
        chain: clobChain,
        signer,
        ...auth
      });
      creds = await l1.createOrDeriveApiKey();
    }

    _client = new ClobClient({
      host: cfg.clobApiUrl,
      chain: clobChain,
      signer,
      creds,
      ...auth
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

function tokensFromClobMarketInfo(info: MarketDetails): TokenIds | null {
  const raw = info.t ?? [];
  const tokens = raw.filter((x): x is ClobToken => x != null && typeof x.t === "string");
  if (tokens.length < 2) return null;

  const yesToken = tokens.find((x) => /yes|up/i.test(x.o ?? ""));
  const noToken = tokens.find((x) => /no|down/i.test(x.o ?? ""));
  if (yesToken && noToken) {
    return { yesTokenId: yesToken.t, noTokenId: noToken.t };
  }
  if (tokens.length >= 2) {
    return { yesTokenId: tokens[0].t, noTokenId: tokens[1].t };
  }
  return null;
}

function tokensFromGammaStyleMarket(market: unknown): TokenIds | null {
  const tokens = (market as { tokens?: Array<{ outcome?: string; token_id?: string; tokenId?: string }> }).tokens;
  if (!tokens || tokens.length < 2) return null;
  const tid = (t: { token_id?: string; tokenId?: string }) => t.token_id ?? t.tokenId ?? "";
  const yesToken = tokens.find((t) => /yes|up/i.test(t.outcome ?? ""));
  const noToken = tokens.find((t) => /no|down/i.test(t.outcome ?? ""));
  if (!yesToken || !noToken) return null;
  const yesId = tid(yesToken);
  const noId = tid(noToken);
  if (!yesId || !noId) return null;
  return { yesTokenId: yesId, noTokenId: noId };
}

export async function getTokenIdsForCondition(conditionId: string): Promise<TokenIds | null> {
  const client = getPublicClient();
  try {
    const info = await client.getClobMarketInfo(conditionId);
    const fromInfo = tokensFromClobMarketInfo(info);
    if (fromInfo) return fromInfo;
  } catch {}
  try {
    const market = await client.getMarket(conditionId);
    return tokensFromGammaStyleMarket(market);
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
        price,
        orderType: marketType
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

export async function verifyClobReadiness(conditionId?: string): Promise<{
  ok: boolean;
  version?: number;
  tokenProbe?: TokenIds | null;
  error?: string;
}> {
  try {
    const client = getPublicClient();
    await client.getOk();
    const version = await client.getVersion();
    let tokenProbe: TokenIds | null | undefined;
    if (conditionId?.trim()) {
      tokenProbe = await getTokenIdsForCondition(conditionId.trim());
    }
    return { ok: true, version, tokenProbe };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err.message ?? String(e) };
  }
}
