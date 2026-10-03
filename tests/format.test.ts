import {describe,expect,it} from "vitest";
import {formatCompactBytes,formatDateTimeUtc,formatInteger,formatUsd} from "../src/lib/format";

describe("deterministic UI formatting",()=>{
 it("formats report byte counts with the explicit English locale",()=>expect(formatInteger(687293)).toBe("687,293"));
 it("formats currency as an estimate-friendly USD amount",()=>expect(formatUsd(0.25)).toBe("$0.25"));
 it("formats compact bytes deterministically",()=>expect(formatCompactBytes(1500)).toBe("1.5KB"));
 it("formats dates in an explicit UTC timezone",()=>expect(formatDateTimeUtc("2026-10-01T03:04:00Z")).toBe("Oct 1, 2026, 3:04 AM"));
});
