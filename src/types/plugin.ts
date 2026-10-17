import type { Plugin } from "obsidian";
import type { PluginServices } from '../plugin/PluginServices';
import type { EventManager } from "../services/EventManager";
import type { HighlightService } from "../services/HighlightService";
import type { PluginSettings } from "./settings";

export interface HiNotePluginContext extends Plugin {
    settings: PluginSettings;
    eventManager: EventManager;
    highlightService: HighlightService;
}

/** Minimal context for UI that only reads settings and standard Obsidian APIs. */
export interface PluginSettingsContext extends Pick<Plugin, 'app'> {
    settings: PluginSettings;
}

/** Capabilities needed by editor integrations that initialize services lazily. */
export interface EditorFeatureContext extends HiNotePluginContext {
    services: PluginServices | null;
    ensureServicesInitialized(): Promise<PluginServices>;
}
