//@ts-ignore
import { StoicIdentity } from "ic-stoic-identity";
import { writable, get } from "svelte/store";
import type { Writable, Readable, Updater, Subscriber, Invalidator, Unsubscriber } from "svelte/store";
import { generatePrincipal, p2Aid } from "@ic0-computer/tools";
import { Actor, HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import type { Identity } from "@dfinity/agent";
import type { InterfaceFactory } from "@dfinity/candid/lib/cjs/idl";
import './typings'

export type Wallet = {
  status: "disconnected" | "connecting" | "connected";
  principal?: Principal;
  accountId?: string;
  identity?: Identity;
  accounts?: string[];
};

export type WalletStore = {
  stoic?: Wallet;
  plug?: Wallet;
  bitfinity?: Wallet;
  seed?: Wallet[];
};

class ConnectrClass implements Readable<WalletStore> {
  private store: Writable<WalletStore>;
  private whitelist: string[] = [];
  private host: string = '';

  constructor({ host, whitelist }: { host: string; whitelist?: string[]; }) {
    this.store = writable<WalletStore>();
    this.host = host;
    this.whitelist = whitelist || [];
    
    this.stoicConnect = this.stoicConnect.bind(this);
    this.plugConnect = this.plugConnect.bind(this);
    this.bitfinityConnect = this.bitfinityConnect.bind(this);
    this.stoicInit = this.stoicInit.bind(this);
    this.plugInit = this.plugInit.bind(this);
    this.bitfinityInit = this.bitfinityInit.bind(this);
    this.stoicDisconnect = this.stoicDisconnect.bind(this);
    this.plugDisconnect = this.plugDisconnect.bind(this);
    this.bitfinityDisconnect = this.bitfinityDisconnect.bind(this);

    this.stoicGetAgent = this.stoicGetAgent.bind(this);
  }

  subscribe(run: Subscriber<WalletStore>, invalidate?: Invalidator<WalletStore>): Unsubscriber {
    return this.store.subscribe(run, invalidate);
  }

  update(updater: Updater<WalletStore>) {
    return this.store.update(updater);
  }

  set(value: WalletStore) {
    return this.store.set(value);
  }

  getStore () {
    return get(this.store);
  }

  async stoicConnect() {
    await StoicIdentity.load().then(async (identity : any) => {
      if (identity !== false) {
        // ID is an already connected wallet!
      } else {
        // No existing connection, let's make one!
        identity = await StoicIdentity.connect();
      }

      const accounts = JSON.parse(await identity.accounts());
      const principal = await identity.getPrincipal();

      this.store.update((store) => ({
        ...store,
        stoic: {
          status: "connected",
          principal: principal,
          accountId: accounts[0].address,
          identity: identity,
          accounts: accounts,
        }
      }));
    });
  }

  async stoicInit() {
    await this.stoicConnect()
  }

  async stoicIsConnected(): Promise<boolean> {
    const identity = await StoicIdentity.load();
    return identity !== false;
  }

  async stoicDisconnect() {
    StoicIdentity.disconnect();
    this.store.update((store) => ({
      ...store,
      stoic: {
        status: "disconnected",
      },
    }));
  }

  async stoicGetAgent(canisterId: string, idlFactory: any): Promise<any> {
    const stoicIdentity = get(this.store)?.stoic?.identity;

    if (stoicIdentity) {
      // Create an HttpAgent with the provided identity and host
      const agent = new HttpAgent({
        identity: stoicIdentity,
        host: this.host,
      });

      // Create an actor using the candid interface and the HttpAgent
      const actor = Actor.createActor(idlFactory, {
        agent,
        canisterId,
      });

      return actor;
    } else {
      throw new Error("Stoic identity is undefined");
    }
  }


  async plugConnect() {
    if (window.ic?.plug === undefined) {
      window.open("https://plugwallet.ooo/", "_blank");
      return;
    }

    const plugConnected = await window.ic?.plug?.isConnected();
    if (!plugConnected) {
      try {
        await window.ic?.plug.requestConnect({
          whitelist: this.whitelist,
          host: this.host,
        });
        console.log("plug connected");
      } catch (e) {
        console.warn(e);
        return;
      }
    }

    await this.plugInit();
  }

  async plugInit() {
    if (!window.ic?.plug?.agent) {
      console.warn("no agent found");
      const result = await window.ic?.plug?.createAgent({
        whitelist: this.whitelist,
        host: this.host,
      });
      result
        ? console.log("agent created")
        : console.warn("agent creation failed");
    }

    if (!window.ic?.plug?.createActor) {
      console.warn("no createActor found");
      return;
    }

    if (this.host !== "https://icp0.io") {
      await window.ic.plug.agent.fetchRootKey().catch((err: Error) => {
        console.warn(
          "Unable to fetch root key. Check to ensure that your local replica is running"
        );
        console.error(err);
      });
    }

    const principal = await window.ic.plug.agent.getPrincipal();
    const account_id = p2Aid(principal.toString());

    this.store.update((store) => ({
      ...store,
      plug: {
        status: "connected",
        principal: principal,
        accountId: account_id,
      }
    }));

    console.log("plug is authed");
  }

  async plugIsConnected(): Promise<boolean> {
    return await window.ic?.plug?.isConnected();
  }

  async plugDisconnect() {
    await window.ic?.plug.disconnect();
    this.store.update((store) => ({
      ...store,
      plug: {
        status: "disconnected",
      },
    }));
  }

  async plugGetAgent(canisterId: string, idlFactory: InterfaceFactory): Promise<any> {
    return (await window.ic?.plug.createActor({
      canisterId: canisterId,
      interfaceFactory: idlFactory,
    }))
  }

  async bitfinityConnect() {
    if (window.ic?.bitfinityWallet === undefined) {
      window.open("https://wallet.infinityswap.one/", "_blank");
      return;
    }

    const bitfinityConnected = await window.ic?.bitfinityWallet?.isConnected();
    if (!bitfinityConnected) {
      try {
        await window.ic?.bitfinityWallet.requestConnect({ whitelist: this.whitelist });
        console.log("bitfinity connected");
      } catch (e) {
        console.warn(e);
        return;
      }
    }

    await this.bitfinityInit();
  }

  async bitfinityInit() {
    const principal = await window.ic.bitfinityWallet.getPrincipal();
    const accountId = await window.ic.bitfinityWallet.getAccountID();

    this.store.update((store) => ({
      ...store,
      bitfinity: {
        status: "connected",
        principal: principal,
        accountId: accountId,
      }
    }));

    console.log("bitfinity is authed");
  }

  async bitfinityIsConnected(): Promise<boolean> {
    return await window.ic?.bitfinityWallet?.isConnected();
  }

  async bitfinityDisconnect() {
    await window.ic?.bitfinityWallet?.disconnect();
    this.store.update((store) => ({
      ...store,
      bitfinity: {
        status: "disconnected",
      },
    }));
  }

  async bitfinityGetAgent(canisterId: string, idlFactory: InterfaceFactory): Promise<any> {
    return (await window.ic.bitfinityWallet.createActor({
      canisterId: canisterId,
      interfaceFactory: idlFactory,
    }))
  }

  async seedCreate(seedPhrase: string): Promise<void> {
    const identity = generatePrincipal(seedPhrase).identity;

    // Get the current array of seed accounts from the store
    const currentSeedAccounts = get(this.store)?.seed || [];

    // Add the new seed identity to the array
    const updatedSeedAccounts = [...currentSeedAccounts, {
      status: "connected" as const,
      principal: identity.getPrincipal(),
      accountId: p2Aid(identity.getPrincipal()),
      identity: identity,
    }];

    this.store.update((store) => ({
      ...store,
      seed: updatedSeedAccounts,
    }));
  }

  async seedGetAgent(canisterId: string, idlFactory: any, index: number): Promise<any> {
    const seedAccounts = get(this.store)?.seed;
    console.log(seedAccounts)

    if (seedAccounts && seedAccounts.length > index) {
      const selectedSeed = seedAccounts[index];
      const agent = new HttpAgent({
        host: this.host,
        identity: selectedSeed.identity,
      });

      const actor = Actor.createActor(idlFactory, {
        canisterId: canisterId,
        agent: agent,
      });

      return actor;
    } else {
      throw new Error("Invalid seed index or seed identity is undefined");
    }
  }

};

export let createConnectr = ({ host, whitelist }: { host: string; whitelist?: string[]; }): Connectr => {
  return new ConnectrClass({host, whitelist});
}

export type Connectr = ConnectrClass & Readable<WalletStore>;