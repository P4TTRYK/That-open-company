import "./style.css";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as OBF from "@thatopen/components-front";
import * as relTabl from "./relationsTreeIndex.ts";
import * as loadBtn from "./loadIfcButtonIndex.ts";
import * as modList from "./modelsListIndex.ts";
import * as propInfo from "./ElementProperties/index.ts";
import * as WEBIFC from "web-ifc";
import * as THREE from "three";

const container = document.getElementById("container");
const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create<
    OBC.SimpleScene,
    OBC.SimpleCamera,
    OBC.SimpleRenderer
>();

world.scene = new OBC.SimpleScene(components);
if (container) {
    world.renderer = new OBC.SimpleRenderer(components, container);
}
world.camera = new OBC.SimpleCamera(components);

components.init();

world.camera.controls.setLookAt(12, 6, 8, 0, 0, 0);
world.scene.setup();

const grids = components.get(OBC.Grids);
const grid = grids.create(world);
grid.config.color = new THREE.Color("#838997");

world.scene.three.background = null;

const fragments = components.get(OBC.FragmentsManager);
const fragmentIfcLoader = components.get(OBC.IfcLoader);
await fragmentIfcLoader.setup();

fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;

async function loadIfc() {
    const file = await fetch(
        "https://thatopen.github.io/engine_components/resources/small.ifc",
    );
    const data = await file.arrayBuffer();
    const buffer = new Uint8Array(data);
    const model = await fragmentIfcLoader.load(buffer);
    world.scene.three.add(model);
}

const [relationsTree] = relTabl.relationsTree({
    components,
    models: [],
});
relationsTree.preserveStructureOnFilter = true;

const indexer = components.get(OBC.IfcRelationsIndexer);
let bbox: THREE.Object3D<THREE.Object3DEventMap> | THREE.Sphere;

const fitToModel = () => {
    world.camera.controls.fitToSphere(bbox, true);
}

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({world});
highlighter.zoomToSelection = true;

highlighter.events.select.onHighlight.add((fragmentIdMap) => {
    updatePropertiesTable({fragmentIdMap});
});

highlighter.events.select.onClear.add(() =>
    updatePropertiesTable({fragmentIdMap: {}}),
);

const [loadIfcBtn] = loadBtn.loadIfc({components});

const [modelsList] = modList.modelsList({
    components,
    tags: {schema: true, viewDefinition: false},
    actions: {download: false},
});

const [propertiesTable, updatePropertiesTable] = propInfo.elementProperties({
    components,
    fragmentIdMap: {},
});

propertiesTable.preserveStructureOnFilter = true;
propertiesTable.indentationInText = false;

const hider = components.get(OBC.Hider);
const classifier = components.get(OBC.Classifier);

fragments.onFragmentsLoaded.add(async (model) => {
    if (model.hasProperties) await indexer.process(model);
    if (world.scene) world.scene.three.add(model);

    const fragmentBbox = components.get(OBC.BoundingBoxer);
    fragmentBbox.add(model);
    bbox = fragmentBbox.getMesh();
    fragmentBbox.reset();

    classifier.byEntity(model);
    await classifier.bySpatialStructure(model, {
        isolate: new Set([WEBIFC.IFCBUILDINGSTOREY]),
    });

    const spatialStructures: Record<string, any> = {};
    const structureNames = Object.keys(classifier.list.spatialStructures);
    for (const name of structureNames) {
        spatialStructures[name] = true;
    }

    const classes: Record<string, any> = {};
    const classNames = Object.keys(classifier.list.entities);
    for (const name of classNames) {
        classes[name] = true;
    }

    const floorSection = panel.querySelector(
        "bim-panel-section[name='Floors']",
    ) as BUI.PanelSection;

    const categorySection = panel.querySelector(
        "bim-panel-section[name='Categories']",
    ) as BUI.PanelSection;

    for (const name in spatialStructures) {
        const panel = BUI.Component.create<BUI.Checkbox>(() => {
            return BUI.html`
      <bim-checkbox checked label="${name}"
        @change="${({ target }: { target: BUI.Checkbox }) => {
                const found = classifier.list.spatialStructures[name];
                if (found && found.id !== null) {
                    for (const [_id, model] of fragments.groups) {
                        const foundIDs = indexer.getEntityChildren(model, found.id);
                        const fragMap = model.getFragmentMap(foundIDs);
                        hider.set(target.value, fragMap);
                    }
                }
            }}">
      </bim-checkbox>
    `;
        });
        floorSection.append(panel);
    }

    for (const name in classes) {
        const checkbox = BUI.Component.create<BUI.Checkbox>(() => {
            return BUI.html`
      <bim-checkbox checked label="${name}"
        @change="${({ target }: { target: BUI.Checkbox }) => {
                const found = classifier.find({ entities: [name] });
                hider.set(target.value, found);
            }}">
      </bim-checkbox>
    `;
        });
        categorySection.append(checkbox);
    }

    /* MD
      And we will make some logic that adds a button to the screen when the user is visiting our app from their phone, allowing to show or hide the menu. Otherwise, the menu would make the app unusable.
    */

    const button = BUI.Component.create<BUI.PanelSection>(() => {
        return BUI.html`
      <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
        @click="${() => {
            if (panel.classList.contains("options-menu-visible")) {
                panel.classList.remove("options-menu-visible");
            } else {
                panel.classList.add("options-menu-visible");
            }
        }}">
      </bim-button>
    `;
    });

    document.body.append(button);
});

const onSearch = (e: Event) => {
    const input = e.target as BUI.TextInput;
    relationsTree.queryString = input.value;
};

const onTextInput = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propertiesTable.queryString = input.value !== "" ? input.value : null;
};

const expandTable = (e: Event) => {
    const button = e.target as BUI.Button;
    propertiesTable.expanded = !propertiesTable.expanded;
    button.label = propertiesTable.expanded ? "Collapse" : "Expand";
};

const copyAsTSV = async () => {
    await navigator.clipboard.writeText(propertiesTable.tsv);
};

BUI.Manager.init();

const panel = BUI.Component.create(() => {
    return BUI.html`
        <bim-panel active label="IFC Viewer" class="options-menu">
            <bim-panel-section icon="mage:box-3d" label="Loaded Models">
                ${modelsList}
            </bim-panel-section>
            <bim-panel-section label="Functions" icon="mage:information-circle">
                <bim-panel-section>
                    <bim-button label="Load internet IFC" @click="${loadIfc}" icon="mage:wifi"></bim-button>
                    ${loadIfcBtn}
                    <bim-button label="Fit BIM model" @click="${fitToModel}" icon="mage:scale-up"></bim-button>
                </bim-panel-section>
            </bim-panel-section>
            <bim-panel-section label="Model Content" collapsed icon="mage:search">
                <bim-text-input
                    @input=${onSearch}
                    placeholder="Search..."
                    debounce="200"
                ></bim-text-input>
                ${relationsTree}
            </bim-panel-section>
            <bim-panel-section collapsed label="Floors" name="Floors" icon="mage:stack"></bim-panel-section>
            <bim-panel-section collapsed label="Categories" name="Categories" icon="mage:arrowlist"></bim-panel-section>
            <bim-panel-section label="Element Data" collapsed icon="mage:information-circle">
                <div style="display: flex; gap: 0.5rem;">
                    <bim-button @click=${expandTable} label=${propertiesTable.expanded ? "Collapse" : "Expand"}></bim-button> 
                    <bim-button @click=${copyAsTSV} label="Copy as TSV"></bim-button> 
                </div> 
                <bim-text-input @input=${onTextInput} placeholder="Search Property" debounce="250"></bim-text-input>
                    ${propertiesTable}
            </bim-panel-section>
      </bim-panel>
  `;
});

document.body.append(panel);
