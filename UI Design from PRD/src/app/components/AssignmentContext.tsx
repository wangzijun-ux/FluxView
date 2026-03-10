import React, { createContext, useContext, useState, ReactNode } from "react";
import { INITIAL_WORKERS } from "./processStore";

export interface GanttAssignment {
    id: string;
    workerId: string;
    areaId: string;
    processId: string;
    start: number; // hour (e.g. 8.5 for 8:30)
    duration: number; // hours
}

interface AssignmentContextType {
    assignments: GanttAssignment[];
    setAssignments: React.Dispatch<React.SetStateAction<GanttAssignment[]>>;
}

const AssignmentContext = createContext<AssignmentContextType | undefined>(undefined);

export const parseTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h + m / 60;
};

export const AssignmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [assignments, setAssignments] = useState<GanttAssignment[]>(() => {
        const initial: GanttAssignment[] = [];
        INITIAL_WORKERS.forEach((worker) => {
            const shiftS = worker.shiftStart ? parseTime(worker.shiftStart) : 8;
            const shiftE = worker.shiftEnd ? parseTime(worker.shiftEnd) : 17;

            // Replicate mock assignments (consistent with WorkPerformance.tsx)
            if (["w1", "w2", "w3"].includes(worker.id)) {
                initial.push({ id: `${worker.id}-1`, workerId: worker.id, areaId: "area-1", processId: "p1", start: shiftS, duration: 2.5 });
                initial.push({ id: `${worker.id}-2`, workerId: worker.id, areaId: "area-1", processId: "p2", start: shiftS + 3, duration: 3 });
                initial.push({ id: `${worker.id}-3`, workerId: worker.id, areaId: "area-2", processId: "p3", start: shiftS + 6.5, duration: Math.max(0.5, shiftE - (shiftS + 6.5)) });
            } else if (["w9", "w10"].includes(worker.id)) {
                initial.push({ id: `${worker.id}-1`, workerId: worker.id, areaId: "area-2", processId: "p2", start: shiftS, duration: 2.5 });
                initial.push({ id: `${worker.id}-2`, workerId: worker.id, areaId: "area-2", processId: "p3", start: shiftS + 3, duration: 3 });
                initial.push({ id: `${worker.id}-3`, workerId: worker.id, areaId: "area-2", processId: "p3", start: shiftS + 6.5, duration: Math.max(0.5, shiftE - (shiftS + 6.5)) });
            } else {
                initial.push({ id: `${worker.id}-1`, workerId: worker.id, areaId: "area-3", processId: "p3", start: shiftS, duration: 2.5 });
                initial.push({ id: `${worker.id}-2`, workerId: worker.id, areaId: "area-3", processId: "p3", start: shiftS + 3, duration: 3 });
                initial.push({ id: `${worker.id}-3`, workerId: worker.id, areaId: "area-3", processId: "p3", start: shiftS + 6.5, duration: Math.max(0.5, shiftE - (shiftS + 6.5)) });
            }
        });
        return initial;
    });

    return (
        <AssignmentContext.Provider value={{ assignments, setAssignments }}>
            {children}
        </AssignmentContext.Provider>
    );
};

export const useAssignments = () => {
    const context = useContext(AssignmentContext);
    if (!context) {
        throw new Error("useAssignments must be used within an AssignmentProvider");
    }
    return context;
};
