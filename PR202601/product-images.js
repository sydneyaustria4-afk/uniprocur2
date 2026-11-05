"use strict";

(() => {
  const productImages = [
    { file: "Canvas Fabric.svg", names: ["canvas fabric"] },
    { file: "Eva Foam Sheets.svg", names: ["eva foam", "eva foam sheet", "eva foam sheets"] },
    { file: "Full Grain Leather.svg", names: ["full grain leather"] },
    { file: "Mesh Fabric.svg", names: ["mesh fabric"] },
    { file: "Metal Buckles.svg", names: ["metal buckle", "metal buckles"] },
    { file: "Metal Eyelets.svg", names: ["metal eyelet", "metal eyelets"] },
    { file: "Nubuck Leather.svg", names: ["nubuck leather"] },
    { file: "PU Leather.svg", names: ["pu leather", "p.u. leather"] },
    { file: "Packaging Tape.svg", names: ["packaging tape"] },
    { file: "Rubber Cement.svg", names: ["rubber cement"] },
    { file: "Shoes Box.svg", names: ["shoe box", "shoe boxes", "shoes box"] },
    { file: "Suede Leather.svg", names: ["suede leather"] },
    { file: "Tissue Paper Rolls.svg", names: ["tissue paper roll", "tissue paper rolls"] },
    { file: "TPR Outsoles.svg", names: ["tpr outsole", "tpr outsoles"] },
    {
      file: "Vulcanized Rubber Outsoles.svg",
      names: ["vulcanized rubber outsole", "vulcanized rubber outsoles"]
    },
    { file: "Zippers.svg", names: ["zipper", "zippers"] },
    { file: "leather.svg", names: ["leather"] },
    { file: "mesh.svg", names: ["mesh"] },
    { file: "shoes.svg", names: ["shoes"] }
  ];

  const normalize = (value) =>
    String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  window.resolveProcurementProductImage = (itemName, imageFilename = "") => {
    const requestedFilename = String(imageFilename).split(/[\\/]/).pop();
    const requestedImage = productImages.find(
      (image) => image.file === requestedFilename
    );

    if (requestedImage) {
      return `../assets/${requestedImage.file}`;
    }

    const normalizedName = normalize(itemName);
    const matchedImage = productImages.find((image) =>
      image.names.some((name) => normalize(name) === normalizedName)
    );

    return matchedImage ? `../assets/${matchedImage.file}` : "";
  };
})();
