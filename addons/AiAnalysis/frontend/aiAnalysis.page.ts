import './aiAnalysis.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initAiAnalysis } from './aiAnalysis';

addPage(new NamedPage(['problem_ide'], async () => {
    initAiAnalysis();
}));
