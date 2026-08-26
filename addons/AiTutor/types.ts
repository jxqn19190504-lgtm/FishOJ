export type SolutionStage = { id: string; title: string };

export type TutorRun = {
    type?: 'pretest' | 'submit';
    input?: string;
    expected?: string;
    stdout?: string;
    stderr?: string;
    status?: string;
    time?: number;
    memory?: number;
};

export type TutorContext = {
    problem: {
        pid: string;
        title: string;
        description: string;
        examples: Array<{ input: string; output: string }>;
        limits?: string;
    };
    learning: {
        objectives: string[];
        concepts: string[];
        stages: SolutionStage[];
        commonMistakes: string[];
        maxHintLevel: number;
    };
    editor: {
        language: string;
        code: string;
    };
    run?: TutorRun;
    history: {
        hintLevel: number;
        hintCount: number;
        recentHints: string[];
        scaffoldLevel: number;
    };
};

export type TutorResponse = {
    progressSummary: string;
    errorCategory: string;
    focus: string;
    hintLevel: number;
    message: string;
    shouldShowCode: boolean;
};

export type TutorSessionDoc = {
    uid: number;
    domainId: string;
    pid: string;
    scaffoldLevel: number;
    hintLevel: number;
    hintCount: number;
    runCount: number;
    lastError?: string;
    lastCodeHash?: string;
    lastStatus?: string;
    recentHints: string[];
    completed: boolean;
    updatedAt: Date;
};

export type TutorEventDoc = {
    uid: number;
    domainId: string;
    pid: string;
    type: string;
    timestamp: Date;
    meta?: Record<string, unknown>;
};

declare module 'hydrooj' {
    interface Collections {
        fish_tutor_session: TutorSessionDoc;
        fish_tutor_event: TutorEventDoc;
    }
    interface SystemKeys {
        'fishoj.aitutor.api_key': string;
        'fishoj.aitutor.base_url': string;
        'fishoj.aitutor.model': string;
    }
}
