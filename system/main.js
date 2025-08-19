
// EXIM 

class EximActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["exim", "sheet", "actor"],
      template: "systems/exim/templates/actor-sheet.hbs",
      width: 640,
      height: "auto",
      dragDrop: [{ dragSelector: ".ex-item-row", dropSelector: ".sheet-body" }]
    });
  }

  get activeTab() {
    return this.actor.getFlag("exim", "activeTab") ?? "carac";
  }
  async setActiveTab(tab) {
    await this.actor.setFlag("exim", "activeTab", tab);
  }

  getData(options) {
    const data = super.getData(options);
    data.system = this.actor.system;
    data.activeTab = this.activeTab;
    return data;
  }

  _applyTab(html, tab) {
    html.find(".ex-tab").removeClass("is-active");
    html.find(`.ex-tab[data-tab='${tab}']`).addClass("is-active");
    const group = "primary";
    html.find(`.sheet-body section[data-group='${group}'][data-tab]`).hide();
    html.find(`.sheet-body section[data-group='${group}'][data-tab='${tab}']`).show();
  }

  activateListeners(html) {
    super.activateListeners(html);

    
    this._applyTab(html, this.activeTab);

    
    html.find(".ex-tab").on("click", async ev => {
      const tab = ev.currentTarget.dataset.tab;
      this._applyTab(html, tab);
      await this.setActiveTab(tab);
    });

    
    html.find("[data-action='roll']").on("click", ev => {
      const aspect = ev.currentTarget.dataset.aspect;
      this._rollAspect(aspect);
    });

    
    html.find("[data-action='edit-image']").on("click", () => this._pickImage());

    
    html.find(".ex-item-create").on("click", ev => {
      let t = ev.currentTarget.dataset?.type ?? $(ev.currentTarget).attr("data-type") ?? "objet";
      t = String(t).trim().toLowerCase();
      if (!["objet","arme","armure"].includes(t)) t = "objet";
      this._createItem(t);
    });
    html.find(".ex-item-delete").on("click", async ev => {
      const row = ev.currentTarget.closest("[data-item-id]");
      const id = row?.dataset.itemId;
      if (!id) return;
      await this.actor.deleteEmbeddedDocuments("Item", [id]);
    });
    html.find(".ex-item-open").on("click", ev => {
      const row = ev.currentTarget.closest("[data-item-id]");
      const id = row?.dataset.itemId;
      const item = this.actor.items.get(id);
      item?.sheet?.render(true);
    });

    
    html.find(".ex-item-row").each((_, tr) => {
      tr.addEventListener("dragstart", ev => {
        const id = tr.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;
        const data = item.toDragData();
        ev.dataTransfer.setData("text/plain", JSON.stringify(data));
      });
    });

    
    html.find("input[name^='item.']").on("change", async ev => {
      const input = ev.currentTarget;
      const [, id, path] = input.name.split(".");
      const value = input.value;
      await this.actor.updateEmbeddedDocuments("Item", [{ _id: id, [path]: value }]);
    });
  }

  async _pickImage() {
    const fp = new FilePicker({
      type: "image",
      current: this.actor.img,
      callback: path => this.actor.update({ img: path })
    });
    return fp.render(true);
  }

  async _createItem(type) {
    const payload = {
      name: type.charAt(0).toUpperCase() + type.slice(1),
      type: type,
      system: { qty: 1, poids: 0, description: "" }
    };
    
    await this.actor.createEmbeddedDocuments("Item", [payload], { render: false });
    
    this.render(false);
  }

  async _rollAspect(aspect) {
    const aspectPath = `system.aspects.${aspect}`;
    let die = foundry.utils.getProperty(this.actor, aspectPath);
    if (!die || die === "-" || die === "d0") {
      ui.notifications?.warn(game.i18n.localize("EXIM.DieExhausted"));
      return;
    }

    const roll = await (new Roll(`1${die}`)).evaluate({async: true});
    const total = roll.total ?? 0;

    let body;
    if (total <= 3) {
      const next = this._degradeDie(die);
      await this.actor.update({ [aspectPath]: next });
      body = `<span class="warn">Conséquences !</span> Résultat ${total} ≤ 3 — le dé s’use (${die} → ${next}).`;
    } else {
      body = `<span class="ok">Réussite</span> Résultat ${total} avec ${die}.`;
    }
    const content = `
      <div class="exim-card">
        <div class="hdr">${game.i18n.format("EXIM.Roll", { aspect })} <span class="badge">${die} : ${total}</span></div>
        <div class="body">${body}</div>
      </div>
    `;
    roll.toMessage({ speaker: ChatMessage.getSpeaker({actor: this.actor}), content });
  }

  _degradeDie(die) {
    const order = ["d20", "d12", "d10", "d8", "d6", "d4"];
    const idx = order.indexOf(die);
    if (idx < 0) return die;
    if (idx === order.length - 1) return "d0";
    return order[idx + 1];
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type === "Item" && data.uuid) {
      const doc = await fromUuid(data.uuid);
      const item = doc?.toObject();
      if (!item) return;
      delete item._id;
      const already = this.actor.items.find(i => i.name === item.name && i.type == item.type);
      if (already) {
        const qty = Number(already.system?.qty ?? 1) + Number(item.system?.qty ?? 1);
        await this.actor.updateEmbeddedDocuments("Item", [{ _id: already.id, "system.qty": qty }]);
      } else {
        await this.actor.createEmbeddedDocuments("Item", [item], { render: false });
      }
      
      this.render(false);
      return;
    }
    return super._onDrop(event);
  }
}

Hooks.once("init", async function() {
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("exim", EximActorSheet, { makeDefault: true });
  await loadTemplates(["systems/exim/templates/actor-sheet.hbs"]);
  Handlebars.registerHelper("array", function() { return Array.from(arguments).slice(0, -1); });
  Handlebars.registerHelper("eq", function(a, b) { return a === b; });
});
