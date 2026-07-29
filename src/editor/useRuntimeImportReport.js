import { useEffect, useState } from "react";

const readJsonDataset = (key) => {
  const value = document.body.dataset[key];
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const useRuntimeImportReport = (selectedObject) => {
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!selectedObject) {
      setReport(null);
      return undefined;
    }

    const readReport = () => {
      if (selectedObject.primitive !== "character") {
        setReport(null);
        return;
      }

      setReport(readJsonDataset("characterDebug"));
    };

    readReport();
    const interval = window.setInterval(readReport, 500);

    return () => window.clearInterval(interval);
  }, [selectedObject]);

  return report;
};
