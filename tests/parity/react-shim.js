// Bundled by build-proto.mjs into an IIFE exposing the app's React 19 as
// window globals for the esbuild-transformed prototype sources.
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";

window.React = React;
window.ReactDOMClient = ReactDOMClient;
