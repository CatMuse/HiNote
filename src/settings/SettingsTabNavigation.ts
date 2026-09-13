import type { Setting, SettingGroup } from 'obsidian';

type Section = { id: string; name: string };
type Panel = { element: HTMLElement; show: () => void };
type Navigation = { select: (id: string) => void; panels: Map<string, Panel> };

/** A navigation row exists only in ordinary settings, never in search results. */
export class SettingsTabNavigation {
    private selected = 'general';
    private readonly groups = new WeakMap<HTMLElement, Navigation>();

    render(setting: Setting, group: SettingGroup, sections: Section[]): () => void {
        setting.settingEl.empty();
        setting.settingEl.addClass('hi-note-searchable-settings');
        const bar = setting.settingEl.createDiv({ cls: 'hi-note-settings-tabs', attr: { role: 'tablist' } });
        const panels = new Map<string, Panel>();
        const buttons = new Map<string, HTMLButtonElement>();
        const select = (id: string) => {
            this.selected = id;
            for (const [key, button] of buttons) {
                button.setAttribute('aria-selected', String(key === id));
                button.tabIndex = key === id ? 0 : -1;
            }
            for (const [key, panel] of panels) {
                panel.element.hidden = key !== id;
                if (key === id) panel.show();
            }
        };
        for (const section of sections) {
            const button = bar.createEl('button', { text: section.name, attr: { type: 'button', role: 'tab' } });
            buttons.set(section.id, button);
            button.onclick = () => select(section.id);
            button.onkeydown = event => {
                const index = sections.findIndex(item => item.id === section.id);
                const target = event.key === 'ArrowRight' ? (index + 1) % sections.length
                    : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
                if (target < 0) return;
                event.preventDefault();
                select(sections[target].id);
                buttons.get(sections[target].id)?.focus();
            };
        }
        const navigation = { select, panels };
        this.groups.set(group.listEl, navigation);
        select(this.selected);
        return () => {
            if (this.groups.get(group.listEl) === navigation) this.groups.delete(group.listEl);
            for (const panel of panels.values()) panel.element.hidden = false;
            panels.clear();
            setting.settingEl.empty();
        };
    }

    attach(group: SettingGroup, id: string, element: HTMLElement, show: () => void): () => void {
        const navigation = this.groups.get(group.listEl);
        if (!navigation) {
            // Search renders the matching definition without the non-searchable navigation row.
            element.hidden = false;
            show();
            return () => {};
        }
        const panel = { element, show };
        navigation.panels.set(id, panel);
        element.setAttribute('role', 'tabpanel');
        navigation.select(this.selected);
        // Obsidian 1.14 scrolls to and flashes the existing setting row on search navigation.
        // Keep this DOM compatibility hook isolated; other renderers use the fallback above.
        const reveal = () => {
            if (!element.classList.contains('is-flashing')) return;
            navigation.select(id);
            element.scrollIntoView({ block: 'nearest' });
        };
        const observer = new MutationObserver(reveal);
        observer.observe(element, { attributes: true, attributeFilter: ['class'] });
        const focus = () => navigation.select(id);
        element.addEventListener('focusin', focus);
        return () => {
            observer.disconnect();
            element.removeEventListener('focusin', focus);
            if (navigation.panels.get(id) === panel) navigation.panels.delete(id);
        };
    }
}
