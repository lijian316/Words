import { FSRS, Rating, type Card, type CardInput, type DateInput, type Grade } from "ts-fsrs"

export function useGetGradeByWrongTimes() {
    let store = useSettingStore()
    function getGradeByWrongTimes(wrongTimes?: number): Rating {
        if (wrongTimes !== undefined) {
            if (wrongTimes <= store.fsrsEasyLimit ) return Rating.Easy
            else if (wrongTimes <= store.fsrsGoodLimit) return Rating.Good
            else if (wrongTimes <= store.fsrsHardLimit) return Rating.Hard
            else return Rating.Again
        } else {
            return Rating.Easy
        }
    }
    return { getGradeByWrongTimes }
}


export function useNextCard() {
    let store = useSettingStore()
    let fsrs = new FSRS(store.fsrsParameters);
    function nextCard(card: CardInput | Card, grade: Grade): Card {
        return fsrs.next(card, new Date(), grade).card
    }
    return { nextCard }
}