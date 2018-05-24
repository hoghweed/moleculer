"use strict";

let Promise = require("bluebird");
let Context = require("../../src/context");
let ServiceBroker = require("../../src/service-broker");
let { MoleculerError, RequestSkippedError, MaxCallLevelError } = require("../../src/errors");
const { protectReject } = require("./utils");

describe("Test Context", () => {

	it("test with empty opts", () => {

		let ctx = new Context();

		expect(ctx.id).toBeNull();
		/*expect(ctx.broker).not.toBeDefined();
		expect(ctx.action).not.toBeDefined();
		expect(ctx.service).toBeNull();
		expect(ctx.nodeID).toBeNull();
		expect(ctx.parentID).toBeNull();

		expect(ctx.metrics).toBe(false);
		expect(ctx.level).toBe(1);

		expect(ctx.timeout).toBe(0);
		expect(ctx.retries).toBe(0);

		expect(ctx.params).toEqual({});
		expect(ctx.meta).toEqual({});

		expect(ctx.requestID).toBeNull();
		expect(ctx.startTime).toBeNull();
		expect(ctx.startHrTime).toBeNull();
		expect(ctx.stopTime).toBeNull();
		expect(ctx.duration).toBe(0);

		expect(ctx.tracked).toBe(false);

		expect(ctx.cachedResult).toBe(false);*/
	});
/*
	it("test with constructor params", () => {

		let broker = new ServiceBroker({ logger: false });
		let action = {
			name: "posts.find"
		};

		let ctx = new Context(broker, action);

		expect(ctx.broker).toBe(broker);
		expect(ctx.action).toBe(action);
		expect(ctx.nodeID).toBe(broker.nodeID);
	});

	it("test with constructor params & service", () => {

		let broker = new ServiceBroker({ logger: false });
		let action = {
			name: "posts.find",
			service: {
				name: "posts"
			}
		};

		let ctx = new Context(broker, action);

		expect(ctx.broker).toBe(broker);
		expect(ctx.action).toBe(action);
		expect(ctx.service).toBe(action.service);
		expect(ctx.nodeID).toBe(broker.nodeID);
	});
});

describe("Test setParams", () => {
	it("should override the params", () => {

		let params1 = { a: 1 };
		let params2 = { b: 5 };

		let ctx = new Context();
		ctx.params = params1;

		ctx.setParams(params2);

		expect(ctx.params).not.toBe(params1);
		expect(ctx.params).toBe(params2);
	});

	it("should clone the params", () => {

		let params1 = {
			a: 1
		};

		let ctx = new Context();
		ctx.params1 = params1;

		let params2 = {
			b: 5
		};

		ctx.setParams(params2, true);
		expect(ctx.params).not.toBe(params2);
		expect(ctx.params).toEqual(params2);
	});
});


describe("Test tracking", () => {

	let broker = new ServiceBroker({ logger: false, trackContext: true });
	let action = {
		name: "posts.find",
		service: {
			name: "posts",
			_addActiveContext: jest.fn(),
			_removeActiveContext: jest.fn()
		}
	};

	it("should call service._addActiveContext", () => {
		const ctx = new Context(broker, action);
		ctx._trackContext();

		expect(ctx.tracked).toBe(true);
		expect(action.service._addActiveContext).toHaveBeenCalledTimes(1);
		expect(action.service._addActiveContext).toHaveBeenCalledWith(ctx);

		ctx.dispose();

		expect(action.service._removeActiveContext).toHaveBeenCalledTimes(1);
		expect(action.service._removeActiveContext).toHaveBeenCalledWith(ctx);
	});

	it("should be tracked if opts.trackContext is true", () => {
		const ctx = Context.create(broker, action, broker.nodeID, {}, { trackContext: true });
		expect(ctx.tracked).toBe(true);
	});

	it("should not be tracked if opts.trackContext is false", () => {
		const ctx = Context.create(broker, action, broker.nodeID, {}, { trackContext: false });
		expect(ctx.tracked).toBe(false);
	});

});

describe("Test call method", () => {
	let broker = new ServiceBroker({ logger: false, maxCallLevel: 5 });
	broker.call = jest.fn(() => broker.Promise.resolve());

	it("should call broker.call method with itself", () => {
		let ctx = new Context(broker);

		let p = { id: 5 };
		ctx.call("posts.find", p);

		expect(broker.call).toHaveBeenCalledTimes(1);
		expect(broker.call).toHaveBeenCalledWith("posts.find", p, { parentCtx: ctx });
	});

	it("should call broker.call method with options", () => {
		broker.call.mockClear();

		let ctx = new Context(broker);
		ctx.level = 4;

		let p = { id: 5 };
		ctx.call("posts.find", p, { timeout: 2500 });

		expect(broker.call).toHaveBeenCalledTimes(1);
		expect(broker.call).toHaveBeenCalledWith("posts.find", p, { parentCtx: ctx, timeout: 2500 });
	});

	it("should decrement the timeout with elapsed time", () => {
		broker.call.mockClear();

		let ctx = new Context(broker);
		ctx._metricStart();
		ctx.timeout = 1000;
		return Promise.delay(300).catch(protectReject).then(() => {
			ctx.call("posts.find", {});

			expect(broker.call).toHaveBeenCalledTimes(1);
			let opts = broker.call.mock.calls[0][2];
			expect(opts.timeout).toBeGreaterThan(500);
			expect(opts.timeout).toBeLessThan(800);
		});
	});

	it("should throw RequestSkippedError", () => {
		broker.call.mockClear();

		let ctx = new Context(broker);
		ctx._metricStart();
		ctx.timeout = 200;
		return Promise.delay(300).then(() => {
			return ctx.call("posts.find", {});
		}).then(protectReject).catch(err => {
			expect(broker.call).toHaveBeenCalledTimes(0);
			expect(err).toBeInstanceOf(RequestSkippedError);
			expect(err.data.action).toBe("posts.find");
		});
	});

	it("should throw Error if reached the 'maxCallLevel'", () => {
		broker.call.mockClear();

		let ctx = new Context(broker);
		ctx.level = 5;
		return ctx.call("posts.find", {}).then(protectReject).catch(err => {
			expect(broker.call).toHaveBeenCalledTimes(0);
			expect(err).toBeInstanceOf(MaxCallLevelError);
			expect(err.code).toBe(500);
			expect(err.data).toEqual({ level: 5 });
		});
	});
});

describe("Test call with meta merge", () => {
	let broker = new ServiceBroker({ logger: false, maxCallLevel: 5 });
	let err = new Error("Subcall error");

	broker.call = jest.fn()
		.mockImplementationOnce(() => {
			const p = broker.Promise.resolve();
			p.ctx = {
				meta: {
					b: 5
				}
			};
			return p;
		})
		.mockImplementationOnce(() => {
			const p = broker.Promise.reject(err);
			p.ctx = {
				meta: {
					b: 5
				}
			};
			return p;
		});

	it("should merge meta from sub-context if resolved", () => {
		let ctx = new Context(broker);
		ctx.meta.a = "Hello";
		ctx.meta.b = 1;
		ctx._metricStart();
		return ctx.call("posts.find", {}).catch(protectReject).then(() => {
			expect(broker.call).toHaveBeenCalledTimes(1);
			expect(ctx.meta).toEqual({ a: "Hello", b: 5 });
		});
	});

	it("should merge meta from sub-context if rejected", () => {
		broker.call.mockClear();
		let ctx = new Context(broker);
		ctx.meta.a = "Hello";
		ctx.meta.b = 1;
		ctx._metricStart();
		return ctx.call("posts.find", {}).then(protectReject).catch(e => {
			expect(e).toBe(err);
			expect(broker.call).toHaveBeenCalledTimes(1);
			expect(ctx.meta).toEqual({ a: "Hello", b: 5 });
		});
	});
});

describe("Test emit method", () => {
	let broker = new ServiceBroker({ logger: false });
	broker.emit = jest.fn();

	let ctx = new Context(broker);

	it("should call broker.emit method with object param", () => {
		let data = { id: 5 };
		ctx.emit("request.rest", data);

		expect(broker.emit).toHaveBeenCalledTimes(1);
		expect(broker.emit).toHaveBeenCalledWith("request.rest", data, undefined);
	});

	it("should call broker.emit method with string param", () => {
		broker.emit.mockClear();
		ctx.emit("request.rest", "string-data");
		expect(broker.emit).toHaveBeenCalledTimes(1);
		expect(broker.emit).toHaveBeenCalledWith("request.rest", "string-data", undefined);
	});

	it("should call broker.emit method without payload & groups", () => {
		broker.emit.mockClear();
		ctx.emit("request.rest", null, ["mail"]);
		expect(broker.emit).toHaveBeenCalledTimes(1);
		expect(broker.emit).toHaveBeenCalledWith("request.rest", null, ["mail"]);
	});
});

describe("Test broadcast method", () => {
	let broker = new ServiceBroker({ logger: false });
	broker.broadcast = jest.fn();

	let ctx = new Context(broker);

	it("should call broker.broadcast method with object param", () => {
		let data = { id: 5 };
		ctx.broadcast("request.rest", data);

		expect(broker.broadcast).toHaveBeenCalledTimes(1);
		expect(broker.broadcast).toHaveBeenCalledWith("request.rest", data, undefined);
	});

	it("should call broker.broadcast method with string param", () => {
		broker.broadcast.mockClear();
		ctx.broadcast("request.rest", "string-data");
		expect(broker.broadcast).toHaveBeenCalledTimes(1);
		expect(broker.broadcast).toHaveBeenCalledWith("request.rest", "string-data", undefined);
	});

	it("should call broker.broadcast method without payload & groups", () => {
		broker.broadcast.mockClear();
		ctx.broadcast("request.rest", null, ["mail"]);
		expect(broker.broadcast).toHaveBeenCalledTimes(1);
		expect(broker.broadcast).toHaveBeenCalledWith("request.rest", null, ["mail"]);
	});
*/
});

