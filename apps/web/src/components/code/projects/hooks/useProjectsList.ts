"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    ProjectErrorResponse,
    ProjectListResponse,
    ProjectSummary,
} from "@/lib/projects/projectApiTypes";

export function useProjectsList(args: {
    enabled: boolean;
    archived?: boolean;
}) {
    const { enabled, archived = false } = args;

    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!enabled) return;

        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams();
            if (archived) params.set("archived", "1");

            const res = await fetch(
                `/api/ide/projects${params.toString() ? `?${params.toString()}` : ""}`,
                {
                    method: "GET",
                    cache: "no-store",
                },
            );

            const data = (await res.json()) as ProjectListResponse | ProjectErrorResponse;

            if (!res.ok || !data.ok) {
                throw new Error(
                    "error" in data ? data.error : "Failed to load projects.",
                );
            }

            setProjects(data.projects ?? []);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load projects.");
        } finally {
            setLoading(false);
        }
    }, [enabled, archived]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        projects,
        loading,
        error,
        refresh,
        setProjects,
    };
}