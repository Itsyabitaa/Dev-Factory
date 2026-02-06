#!/usr/bin/env node
import { createSpec } from "./create-spec.js";

const command = process.argv[2];

if (command === "create-spec") {
    createSpec();
} else {
    console.log("Usage: devfactory create-spec");
}
