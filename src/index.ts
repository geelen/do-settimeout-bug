import { DurableObject } from 'cloudflare:workers'

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/**
 * Associate bindings declared in wrangler.toml with the TypeScript type system
 */
export interface Env {
	MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObject>
}

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject<Env> {
	object_instantiation_time = performance.now()
	private human_ids: Record<string, string> = {}
	private name?: string

	async sayHello(name: string, who: string): Promise<string> {
		this.name = name

		this.log(`Hi from now.`)
		for (let i = 1; i <= 200; i++) {
			setTimeout(() => {
				this.log(`Hi from ${i * 5} seconds ago.`)
			}, i * 5_000)
		}
		return `Hello, ${who}!`
	}

	// Get a short (8 char) hash of an id so we can track if there's more than one object with the same ID
	private async getHumanInstanceId(input: string) {
		return (this.human_ids[input] ??= btoa(
			Array.from(
				new Uint32Array(
					await crypto.subtle.digest(
						'SHA-256',
						new TextEncoder().encode(input),
					),
				),
			).join(''),
		).slice(-10, -2))
	}

	private async log(str: string) {
		const raw_object_id = this.ctx.id.toString()
		const object_id = await this.getHumanInstanceId(raw_object_id)
		const raw_instance_id = this.object_instantiation_time.toString()
		const instance_id = await this.getHumanInstanceId(raw_instance_id)
		const message = `[${this.name} • ${object_id} • ${instance_id}] ${str}`
		console.log(message)
		await fetch(`https://events.baselime.io/v1/logs`, {
			method: 'POST',
			headers: {
				'x-api-key': 'e673cb41a6638eada520defb90b236b9aa257d53',
				'content-type': 'application/json',
				'x-service': 'do-settimeout-bug',
			},
			body: JSON.stringify([
				{
					message,
					namespace: this.name,
					data: { object_id, raw_object_id, instance_id, raw_instance_id },
				},
			]),
		})
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// We will create a `DurableObjectId` using the pathname from the Worker request
		// This id refers to a unique instance of our 'MyDurableObject' class above
		let name = new URL(request.url).pathname
		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(name)

		// This stub creates a communication channel with the Durable Object instance
		// The Durable Object constructor will be invoked upon the first call for a given id
		let stub = env.MY_DURABLE_OBJECT.get(id)

		// We call the `sayHello()` RPC method on the stub to invoke the method on the remote
		// Durable Object instance
		let greeting = await stub.sayHello(name, 'world')

		return new Response(greeting)
	},
}
