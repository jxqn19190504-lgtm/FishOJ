import './aiTutor.css';
import { addPage, NamedPage } from '@hydrooj/ui-default';
import { initAiTutor } from './aiTutor';

addPage(new NamedPage(['problem_ide'], async () => {
    initAiTutor();
}));
