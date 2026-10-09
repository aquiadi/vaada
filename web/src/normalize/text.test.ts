import { describe, expect, it } from "vitest";
import { email, organisation, personName, work } from "./text";

describe("personName", () => {
  it.each<[string, string]>([
    ["rahul mehta", "Rahul Mehta"],
    ["Rahul Mehta.", "Rahul Mehta"],
    ["  aditi   rao ", "Aditi Rao"],
    ["Mera naam Aditi Rao hai.", "Aditi Rao"],
    ["my name is meera iyer", "Meera Iyer"],
    ["RAHUL MEHTA", "Rahul Mehta"],
    ["d'souza", "D'Souza"],
    ["Anjali McKenzie", "Anjali McKenzie"],
    ["राहुल मेहता", "राहुल मेहता"],
  ])("%s", (raw, value) => {
    expect(personName(raw)).toEqual({ value, confidence: "exact" });
  });

  it("refuses digits in a name", () => {
    expect(personName("Rahul 25000").confidence).toBe("failed");
  });
});

describe("organisation", () => {
  it.each<[string, string]>([
    ["Kiln Labs.", "Kiln Labs"],
    ["kiln.studio", "kiln.studio"],
    ["Pune Coffee Roasters Pvt Ltd.", "Pune Coffee Roasters Pvt Ltd"],
  ])("%s", (raw, value) => {
    expect(organisation(raw)).toEqual({ value, confidence: "exact" });
  });
});

describe("work", () => {
  it.each<[string, string]>([
    ["A logo and brand guidelines.", "a logo and brand guidelines"],
    ["Three Instagram post templates.", "three Instagram post templates"],
    ["Kiln Labs brand identity, logo aur colour palette.", "Kiln Labs brand identity, logo aur colour palette"],
    ["the landing page design", "the landing page design"],
  ])("%s", (raw, value) => {
    expect(work(raw)).toEqual({ value, confidence: "exact" });
  });
});

describe("email", () => {
  it.each<[string, string, "exact" | "inferred"]>([
    ["rahul@kilnlabs.in", "rahul@kilnlabs.in", "exact"],
    ["Rahul@KilnLabs.in.", "rahul@kilnlabs.in", "exact"],
    ["rahul at gmail dot com", "rahul@gmail.com", "inferred"],
    ["Rahul dot Mehta at kiln labs dot in.", "rahul.mehta@kilnlabs.in", "inferred"],
  ])("%s", (raw, value, confidence) => {
    expect(email(raw)).toMatchObject({ value, confidence });
  });

  it("fails on something that isn't an address", () => {
    expect(email("rahul ka email").confidence).toBe("failed");
  });
});
