import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";

test("CoursePage affiche son état de chargement initial sans exception", async () => {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { hmr: false, middlewareMode: true },
  });

  try {
    const { default: CoursePage } = await server.ssrLoadModule("/src/pages/CoursePage.jsx");
    const queryClient = new QueryClient();
    const page = React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(CoursePage),
    );

    assert.match(renderToString(page), /Chargement/);
  } finally {
    await server.close();
  }
});

test("CoursePage affiche un domaine chargé sans exception", async () => {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { hmr: false, middlewareMode: true },
  });

  try {
    const { default: CoursePage } = await server.ssrLoadModule("/src/pages/CoursePage.jsx");
    const queryClient = new QueryClient();
    const domaine = {
      id: 1,
      level: 1,
      name: "Course à pied",
      objectifs: [],
      totalMinutes: 0,
      totalXp: 0,
      xpToNextLevel: 100,
    };
    queryClient.setQueryData(["domaines"], [domaine]);
    queryClient.setQueryData(["domaine-progress", domaine.id], {
      domaine,
      objectifActif: null,
      objectifs: [],
    });
    const page = React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(CoursePage),
    );

    assert.match(renderToString(page), /Prépare ta prochaine course/);
  } finally {
    await server.close();
  }
});
