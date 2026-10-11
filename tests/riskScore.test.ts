import { test, expect } from "node:test";
import assert from "node:assert/strict";
import { 
    calculateOrderHealthScore, 
    evaluateAddress, 
    evaluateCustomer, 
    evaluateCity, 
    evaluateProduct 
} from "../src/utils/riskScore";

test("Address Evaluation: Complete address gets high score", () => {
    const res = evaluateAddress("House 14, Street 7, Block B, Johar Town", "Lahore");
    assert.equal(res.score, 35);
    assert.equal(res.isLandmarkOnly, false);
    assert.equal(res.flags.length, 0);
});

test("Address Evaluation: Landmark-only address gets penalized", () => {
    const res = evaluateAddress("Near Jamia Masjid, Main Chowk", "Kasur");
    assert.ok(res.score < 25, `Expected score < 25 but got ${res.score}`);
    assert.equal(res.isLandmarkOnly, true);
    assert.ok(res.flags.some(f => f.includes("landmarks")));
});

test("Customer Evaluation: Serial returner gets 0 score & flag", () => {
    const res = evaluateCustomer({
        phone: "03072371999",
        totalOrders: 2,
        totalDelivered: 0,
        totalReturned: 2,
        totalCancelled: 0,
        returnRate: 100,
        blacklisted: false
    });
    assert.equal(res.score, 0);
    assert.equal(res.isSerialReturner, true);
    assert.ok(res.flags.some(f => f.includes("Serial Returner")));
});

test("Customer Evaluation: Trusted VIP gets maximum score", () => {
    const res = evaluateCustomer({
        phone: "03001234567",
        totalOrders: 3,
        totalDelivered: 3,
        totalReturned: 0,
        totalCancelled: 0,
        returnRate: 0,
        blacklisted: false
    });
    assert.equal(res.score, 35);
    assert.equal(res.isSerialReturner, false);
});

test("City Evaluation: Kasur detected as Critical High Return Hub", () => {
    const res = evaluateCity("Kasur");
    assert.equal(res.score, 2);
    assert.equal(res.isHighRiskCity, true);
    assert.ok(res.flags.some(f => f.includes("75%")));
});

test("Master Evaluator: Execution speed benchmark < 15ms", () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        calculateOrderHealthScore({
            address: "House 24, Street 10, F-8/2",
            city: "Islamabad",
            customerHistory: {
                phone: "03009999999",
                totalOrders: 1,
                totalDelivered: 1,
                totalReturned: 0,
                totalCancelled: 0,
                returnRate: 0,
                blacklisted: false
            },
            items: [{ productName: "Gionee Handsfree Type-C", packSizeLabel: "Pack of 3" }]
        });
    }
    const elapsed = performance.now() - start;
    const avgPerCall = elapsed / 100;
    console.log(`Average score calculation duration: ${avgPerCall.toFixed(3)}ms per order`);
    assert.ok(avgPerCall < 15, `Expected < 15ms but took ${avgPerCall}ms`);
});
